const puppeteer = require("puppeteer");
require('dotenv').config();
const fs = require('fs');
var path = require('path');
const gTTS = require("gtts");
var ffmpeg = require("fluent-ffmpeg");
const getMP3Duration = require('get-mp3-duration');
const { maxHeaderSize } = require("http");

const ImagePath = process.env.IMAGE_PATH;
const FfmpegPath = process.env.FFMPEG_PATH;
const Email = process.env.EMAIL;
const Password = process.env.PASSWORD;
const NovelTitle = process.env.NOVEL_TITLE;
const NovelLinkPrefix = process.env.NOVEL_LINK_PREFIX;
const NovelLinkSuffix = process.env.NOVEL_LINK_SUFFIX;
const TextPathSelector = process.env.TEXT_PATH_SELECTOR.split(",");
const MaxThreads = 16;
process.setMaxListeners(MaxThreads);

(async () => {
    console.log("IMAGE_PATH: ", ImagePath);
    console.log("FFMPEG_PATH: ", FfmpegPath);
    console.log("EMAIL: ", Email);
    console.log("PASSWORD: ", Password);
    console.log("NOVEL_TITLE: ", NovelTitle);
    console.log("NOVEL_LINK_PREFIX: ", NovelLinkPrefix);
    console.log("NOVEL_LINK_SUFFIX: ", NovelLinkSuffix);
    console.log("TEXT_PATH_SELECTOR:");
    for (let i = 0; i < TextPathSelector.length; i++) {
        console.log(TextPathSelector[i]);
    }

    // console.log("\nLogging in...");
    // const browser = await puppeteer.launch({ headless: false });
    // const page = await browser.newPage();
    // await page.goto("https://studio.youtube.com/channel/UC/playlists");
    // await page.waitForSelector('input[type="email"]');
    // await page.type('input[type="email"]', Email);
    // await Promise.all([
    //     page.waitForNavigation(),
    //     await page.keyboard.press("Enter"),
    // ]);
    // await page.waitForSelector('input[type="password"]', { visible: true });
    // await page.type('input[type="password"]', Password);
    // const res = await Promise.all([
    //     page.waitForFunction(() => location.href.includes("https://studio.youtube.com/channel/") && location.href.includes("/playlists")),
    //     await page.keyboard.press("Enter"),
    // ]);
    // console.log("Logged in!");

    // // move the mouse incase the mouse is hovering ontop of the playlist
    // await page.mouse.move(100000, 100000);

    // console.log("\nGetting all playlists...");
    // await page.waitForSelector('h3[class="playlist-title style-scope ytcp-playlist-row"]');
    // let currentPlaylistTitles = await page.evaluate(() => {
    //     return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
    // });
    // console.log("Got all playlists: ");
    // for (let i = 0; i < currentPlaylistTitles.length; i++) {
    //     console.log(currentPlaylistTitles[i]);
    // }

    let videos = [];

    // if (!currentPlaylistTitles.includes(NovelTitle)) {
    //     console.log(`\nCreating playlist ${NovelTitle}...`);

    //     // select the create playlist button
    //     await page.waitForSelector('ytcp-button[id="new-playlist-button"]');
    //     await page.click('ytcp-button[id="new-playlist-button"]');

    //     // type the title in textarea[class="style-scope ytcp-form-textarea"]
    //     await page.waitForSelector('textarea[class="style-scope ytcp-form-textarea"]');
    //     await page.type('textarea[class="style-scope ytcp-form-textarea"]', NovelTitle);

    //     // select the visibility dropdown ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]
    //     await page.waitForSelector('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
    //     await page.click('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');

    //     // select tp-yt-paper-item[test-id="UNLISTED"]
    //     await page.waitForSelector('tp-yt-paper-item[test-id="UNLISTED"]');
    //     await page.click('tp-yt-paper-item[test-id="UNLISTED"]');

    //     // click the save button ytcp-button[id="create-button"]
    //     await page.waitForSelector('ytcp-button[id="create-button"]');
    //     await page.click('ytcp-button[id="create-button"]');

    //     // wait for the new playlist to be created
    //     while (!currentPlaylistTitles.includes(NovelTitle)) {
    //         await new Promise(resolve => setTimeout(resolve, 100));
    //         currentPlaylistTitles = await page.evaluate(() => {
    //             return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
    //         });
    //     }
    //     console.log(`Created playlist ${NovelTitle}!`);
    // } else {
    //     console.log(`\nGetting all videos in playlist ${NovelTitle}...`);

    //     // get the index of the playlist
    //     let playlistIndex = currentPlaylistTitles.indexOf(NovelTitle);

    //     // get all the hrefs of the playlists div[id="hover-items"] > a:nth-child(1)
    //     await page.waitForSelector('div[id="hover-items"] > a:nth-child(1)');
    //     let currentPlaylistHrefs = await page.evaluate(() => {
    //         return Array.from(document.querySelectorAll('div[id="hover-items"] > a:nth-child(1)')).map(p => p.href);
    //     });

    //     // get the href of the new playlist
    //     let playlistHref = currentPlaylistHrefs[playlistIndex];

    //     // go to the new playlist
    //     await page.goto(playlistHref);

    //     // scroll all the way down to load all the uploaded chapters
    //     await page.evaluate(
    //         () =>
    //             new Promise((resolve) => {
    //                 var scrollTop = -1;
    //                 var ticks = 0;
    //                 const interval = setInterval(() => {
    //                     window.scrollBy(0, 100000);
    //                     if (document.documentElement.scrollTop !== scrollTop) {
    //                         scrollTop = document.documentElement.scrollTop;
    //                         ticks = 0;
    //                         return;
    //                     } else {
    //                         ticks++;
    //                     }
    //                     if (ticks > 50) {  // 50 ticks = 5 seconds
    //                         clearInterval(interval);
    //                         resolve();
    //                     }
    //                 }, 100);
    //             })
    //     );

    //     videos = await page.evaluate(() => {
    //         return Array.from(
    //             document.querySelectorAll("#video-title"),
    //             (video) => video.innerText
    //         );
    //     });

    //     console.log(`Got all videos in playlist ${NovelTitle}:`);
    //     for (let i = 0; i < videos.length; i++) {
    //         console.log(videos[i]);
    //     }
    // }

    for (let i = 1; i <= MaxThreads; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`\nStarting thread ${i}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await uploadChapter(i, page, videos);
    }

    await browser.close();
})();

// upload limit div[class="error-short style-scope ytcp-uploads-dialog"]