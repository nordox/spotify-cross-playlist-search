window.addEventListener("message", (event) => {
    if (event.data === "disable-scroll") {
        document.querySelector("body").style.overflow = "hidden";
        document.querySelector(".container").style.width = "100%";
        document.querySelector(".container").style.margin = "unset";
        document.querySelector(".container > h1").style.display = "none";
        document.querySelector("footer").style.position = "static";
        document.querySelector("footer").style.bottom = "unset";
    }
    if (event.data === "request-access") {
        window.location.href = "/request_access.html";
    }
});

window.onresize = () => {
    resize();
};

let isLoading = false;

document.addEventListener('DOMContentLoaded', () => {

    $(".toggle").prop("checked", localStorage.getItem("has-app") === 'true');

    $(".toggle").change(function () {
        localStorage.setItem("has-app", this.checked);
    });

    startLoading();
    getPlaylists("abc", true).finally(_ => {
        $(".update-playlists").removeClass("hidden");
        endLoading();
    });

    document.querySelector(".search-section").addEventListener('keypress', async (event) => {
        if (event.key === "Enter" && !isLoading) {
            event.preventDefault();

            const input = event.target.value.trim().toLowerCase();

            if (!input) return;

            $(".search-bar").blur();
            $(".list-section").hide();
            $(".list-section").empty(); // needed?
            startLoading();

            const playlists = await getPlaylists(input, true);
            const found = findInPlaylists(playlists, input);

            if (!_.isEmpty(found)) {
                renderFound(found);
                setupClickHandlers();
            }

            resize();

            endLoading();
        }
    });

    document.querySelector(".refresh-btn").addEventListener('click', async (event) => {
        if (isLoading) return;
        $(".list-section").hide();
        startLoading();
        resize();
        const playlists = await getPlaylists("abc", false);
        console.log(playlists);
        endLoading();
    });

});


function setupClickHandlers() {
    document.querySelectorAll(".open-track-btn > button.avail").forEach(el => {
        el.addEventListener('click', function (event) {
            event.preventDefault();
            const hasApp = $(".toggle").is(':checked');
            window.open(hasApp ? this.dataset.uri : this.dataset.href, "_blank");
        });
    });
}

// resize parent iframe container
function resize(selector) {
    const height = document.querySelector(selector || ".container").scrollHeight;
    window.parent.postMessage(["setHeight", height + 50], "*");
}

async function getPlaylists(input, shouldCache) {
    const response = await fetch(`/playlists`, { cache: shouldCache ? "default" : "reload", headers: { q: input } });
    if (response.status === 403) {
        window.location.href = "/request_access.html";
    }
    localStorage.removeItem("email");
    const date = new Date(response.headers.get("Date"));
    $(".last-updated-text").text(`Last updated: ${date.toDateString()} at ${date.toLocaleTimeString()}`);
    return await response.json();
}

function renderFound(found) {
    const elements = [];

    for (let tracks of Object.values(found)) {

        const item = $("<div class=\"found-item\">").html(`
            <h2 class="playlist-name">${tracks[0].playlist}</h2>
        `);

        for (let track of Object.values(tracks)) {
            const artists = [];
            for (let artist of track.artists) {
                artists.push(artist.name);
            }
            const imgSrc = track.album.images[2]?.url;
            item.append(`
                <div class="track ${!imgSrc ? "not-avail" : ""}">
                <div class="album-cover">
                    ${imgSrc
                    ? `<img src="${imgSrc}" alt="" />`
                    : `<div style="width:64px;height:64px">&nbsp;</div>`}
                </div>
                <div class="track-content">
                    <span class="track-name">${track.name}</span>
                    <span class="artists">${artists.join(', ')} · ${track.album.name}</span>
                </div>
                <div class="open-track-btn">
                    ${track.id
                    ? `<button class="open-spotify avail" data-href="${track.external_urls.spotify}" data-uri="${track.uri}"><img src="Spotify_Icon_RGB_White.png" alt="" />Play on Spotify</button>`
                    : `<button class="open-spotify not-avail"><img src="Spotify_Icon_RGB_White.png" alt="" /><span style="position:relative"><span>Play on Spotify</span><div>Not available</div></span></button>`}
                </div>
                </div>
            `);
        }

        elements.push(item);

    }

    $(".list-section").empty();
    $(".list-section").append(elements);
    $(".list-section").show();
}

function findInPlaylists(playlists, input) {
    const found = {};

    try {
        for (let playlist of playlists) {
            found[playlist.id] = {};

            for (let { track } of playlist.tracks) {
                const id = track.id || track.uri;
                if (found[playlist.id][id]) continue;

                // check track name & album
                if (
                    track.name.toLowerCase().includes(input)
                    || track.album.name.toLowerCase().includes(input)
                ) {
                    found[playlist.id][id] = { playlist: playlist.name, ...track };
                } else {
                    // Check artist
                    for (let artist of track.artists) {
                        if (artist.name.toLowerCase().includes(input)) {
                            found[playlist.id][id] = { playlist: playlist.name, ...track };
                        }
                    }
                }
            }
        }

        Object.keys(found).forEach(key => _.isEmpty(found[key]) && delete found[key]);
        Object.keys(found).forEach(key => found[key] = Object.values(found[key]));
    } catch (e) {
        console.error(e)
    }

    return found;
}

function startLoading() {
    isLoading = true;
    $(".loading").show();
}

function endLoading() {
    isLoading = false;
    $(".loading").hide();
}