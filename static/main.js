window.addEventListener("message", (event) => {
    if (event.data === "disable-scroll") {
        document.querySelector("body").style.overflow = "hidden";
    }
    if (event.data === "request-access") {
        window.location.href = "/request_access.html";
    }
});

let isLoading = false;

document.addEventListener('DOMContentLoaded', () => {

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
    document.querySelectorAll(".open-track-btn > button").forEach(el => {
        el.addEventListener('click', function (event) {
            event.preventDefault();
            window.open(this.dataset.href, "_blank");
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
            <h1 class="playlist-name">${tracks[0].playlist}</h1>
        `);

        for (let track of Object.values(tracks)) {
            const artists = [];
            for (let artist of track.artists) {
                artists.push(artist.name);
            }
            const imgSrc = track.album.images[2]?.url;
            item.append(`
                <div class="track ${!imgSrc ? "not-avail" : ""} ${!track.id ? "disabled" : ""}">
                <div class="album-cover">
                    <img src="${imgSrc || "https://i.scdn.co/image/ab6775700000ee85aeb6fb34fde89e0c758f7bbb"}" width=64 height=64 />
                    <svg role="img" height="16" width="16" viewBox="0 0 16 16" class="Svg-ytk21e-0 jAKAlG"><path d="M10 2v9.5a2.75 2.75 0 11-2.75-2.75H8.5V2H10zm-1.5 8.25H7.25A1.25 1.25 0 108.5 11.5v-1.25z"></path></svg>
                </div>
                <div class="track-content">
                    <a class="track-name" href="${track.uri}" target="_blank">${track.name}</a>
                    <span class="artists">${artists.join(', ')} · ${track.album.name}</span>
                </div>
                <div class="open-track-btn"><button data-href="${track.external_urls.spotify}" data-uri="${track.uri}"><img src="Spotify_Icon_RGB_White.png" />Play on Spotify</button></div>
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

                // check track name
                if (track.name.toLowerCase().includes(input)) {
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