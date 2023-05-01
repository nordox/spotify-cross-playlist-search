const express = require('express');
const crypto = require('crypto');
const qs = require('qs');
const compression = require('compression');
const cookieParser = require("cookie-parser");
const SpotifyClient = require('./spotify');
const client_id = '04a301ccb9094be690ff7fea8d0d4db2';
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI || 'http://localhost:8888/callback';
const stateKey = 'spotify_auth_state';
const port = process.env.PORT || 8888;

const spotify = new SpotifyClient(client_id, client_secret, redirect_uri);
const app = express();

app.use(cookieParser());


app.get('/', function (req, res, next) {
    if (req.headers['sec-fetch-dest'] !== 'iframe' && !req.cookies.access_token) {
        return res.redirect('/login');
    }
    next();
});

app.use(express.static('static'));

app.get('/login', loginHandler);
app.get('/callback', callbackHandler);
app.get('/refresh_token', refreshTokenHandler);
app.get('/playlists', compression(), playlistsHandler);


async function callbackHandler(req, res, next, refreshAttempt = false) {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;
    const cb = req.query.cb;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            qs.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);

        try {
            const tokenResponse = await spotify.getToken(code, cb);
            const profileResponse = await spotify.getMe(tokenResponse.data.access_token);

            res.cookie("access_token", tokenResponse.data.access_token, { secure: process.env.NODE_ENV !== "development", httpOnly: true });
            res.cookie("refresh_token", tokenResponse.data.refresh_token, { secure: process.env.NODE_ENV !== "development", httpOnly: true });
            res.cookie("p", Buffer.from(JSON.stringify(profileResponse.data)).toString("base64"), {
                domain: process.env.NODE_ENV !== "development" ? process.env.DOMAIN_NAME : null,
                secure: process.env.NODE_ENV !== "development",
                httpOnly: false
            });
            res.redirect(cb ? cb + "/?auth=true" : "/");
        } catch (e) {
            console.log(" callback error", e.response);

            if (e.response.status === 403) {
                return res.redirect(cb ? cb + "/?auth=false" : "/request_access.html");
            }

            if (e.response.data.error && e.response.data.error.status === 401 && !refreshAttempt) {
                await refreshTokenHandler(req, res, next)
                await callbackHandler(req, res, next, true);
            }
        }
    }
}

function loginHandler(req, res) {

    const scope = 'user-library-read playlist-read-private playlist-read-collaborative';
    const state = crypto.randomUUID().split('-').join('');
    const callback = req.query.cb;

    res.cookie(stateKey, state);

    res.redirect('https://accounts.spotify.com/authorize?' +
        qs.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri + `${callback ? "?cb=" + callback : ""}`,
            state: state
        }));
}

async function playlistsHandler(req, res, next, refreshAttempt = false) {
    
    const token = req.cookies.access_token;
    const query = req.headers.q;

    if (!req.cookies.p) {
        return res.redirect('/login');
    }

    if (!query) {
        return res.status(200).send({});
    }
    try {
        const profileStr = Buffer.from(JSON.stringify(req.cookies.p), 'base64').toString("utf8");
        const playlistsResponse = await spotify.getUserPlaylists(JSON.parse(profileStr).id, token);
        const promises = [
            spotify.getSavedTracks(token).then(response => ({ id: "liked", name: "Liked Songs", tracks: response.data.items }))
        ];

        for (let playlist of playlistsResponse.data.items) {
            promises.push(
                getAllTracks(
                    playlist.id, token,
                    spotify.getPlaylistItems(playlist.id, token)
                ).then(tracks => ({ id: playlist.id, name: playlist.name, tracks }))
            );
        }

        const playlists = await Promise.all(promises);

        // cache response
        res.setHeader("cache-control", "private, max-age=31536000");

        return res.status(200).send(playlists);
    } catch (e) {
        console.log("playlist error", e);

        if (e.response.status === 403) {
            return res.status(403).send();
        }

        if (e.response.data.error && e.response.data.error.status === 401 && !refreshAttempt) {
            await refreshTokenHandler(req, res, next)
            await playlistsHandler(req, res, next, true);
        }
    }
}

async function refreshTokenHandler(req, res, next) {
    const refresh_token = req.cookies.refresh_token;
    const tokenResponse = await spotify.refreshToken(refresh_token);

    res.cookie("access_token", tokenResponse.data.access_token, { secure: process.env.NODE_ENV !== "development", httpOnly: true });
    req.cookies.access_token = tokenResponse.data.access_token;

    return;
}

async function getAllTracks(id, token, playlistReq) {
    const promises = [];
    let tracks = [];
    let response = await playlistReq;
    tracks = tracks.concat(response.data.items);

    for (let i = 1; i < Math.ceil(response.data.total / response.data.items.length); i++) {
        promises.push(spotify.getPlaylistItems(id, token, 100 * i));
    }

    const promiseResponses = await Promise.all(promises);

    for (let r of promiseResponses) {
        tracks = tracks.concat(r.data.items);
    }

    return tracks;
}

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
});