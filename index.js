const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
require('dotenv').config();
const fs = require('fs');
var path = require('path');
const gTTS = require("gtts");
var ffmpeg = require("fluent-ffmpeg");
const getMP3Duration = require('get-mp3-duration');
var userAgent = require('user-agents');
puppeteer.use(StealthPlugin())

const ImagePath = process.env.IMAGE_PATH;
const FfmpegPath = process.env.FFMPEG_PATH;
const Email = process.env.EMAIL;
const Password = process.env.PASSWORD;
const NovelTitle = process.env.NOVEL_TITLE;
const NovelLinkPrefix = process.env.NOVEL_LINK_PREFIX;
const NovelLinkSuffix = process.env.NOVEL_LINK_SUFFIX;
const TextPathSelector = process.env.TEXT_PATH_SELECTOR.split(",");
process.setMaxListeners(1);
var videos = [];

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

    console.log("\nLogging in...");
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://studio.youtube.com/channel/UC/playlists");
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', Email);
    await Promise.all([
        page.waitForNavigation(),
        await page.keyboard.press("Enter"),
    ]);
    await page.waitForSelector('input[type="password"]', { visible: true });
    await page.type('input[type="password"]', Password);
    const res = await Promise.all([
        page.waitForFunction(() => location.href.includes("https://studio.youtube.com/channel/") && location.href.includes("/playlists")),
        await page.keyboard.press("Enter"),
    ]);
    console.log("Logged in!");

    // move the mouse incase the mouse is hovering ontop of the playlist
    await page.mouse.move(100000, 100000);

    console.log("\nGetting all playlists...");
    await page.waitForSelector('h3[class="playlist-title style-scope ytcp-playlist-row"]');
    let currentPlaylistTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
    });
    console.log("Got all playlists: ");
    for (let i = 0; i < currentPlaylistTitles.length; i++) {
        console.log(currentPlaylistTitles[i]);
    }

    if (!currentPlaylistTitles.includes(NovelTitle)) {
        console.log(`\nCreating playlist ${NovelTitle}...`);

        // select the create playlist button
        await page.waitForSelector('ytcp-button[id="new-playlist-button"]');
        await page.click('ytcp-button[id="new-playlist-button"]');

        // type the title in textarea[class="style-scope ytcp-form-textarea"]
        await page.waitForSelector('textarea[class="style-scope ytcp-form-textarea"]');
        await page.type('textarea[class="style-scope ytcp-form-textarea"]', NovelTitle);

        // select the visibility dropdown ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]
        await page.waitForSelector('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
        await page.click('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');

        // select tp-yt-paper-item[test-id="UNLISTED"]
        await page.waitForSelector('tp-yt-paper-item[test-id="UNLISTED"]');
        await page.click('tp-yt-paper-item[test-id="UNLISTED"]');

        // click the save button ytcp-button[id="create-button"]
        await page.waitForSelector('ytcp-button[id="create-button"]');
        await page.click('ytcp-button[id="create-button"]');

        // wait for the new playlist to be created
        while (!currentPlaylistTitles.includes(NovelTitle)) {
            await new Promise(resolve => setTimeout(resolve, 100));
            currentPlaylistTitles = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
            });
        }
        console.log(`Created playlist ${NovelTitle}!`);
    } else {
        console.log(`\nGetting all videos in playlist ${NovelTitle}...`);

        // get the index of the playlist
        let playlistIndex = currentPlaylistTitles.indexOf(NovelTitle);

        // get all the hrefs of the playlists div[id="hover-items"] > a:nth-child(1)
        await page.waitForSelector('div[id="hover-items"] > a:nth-child(1)');
        let currentPlaylistHrefs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div[id="hover-items"] > a:nth-child(1)')).map(p => p.href);
        });

        // get the href of the new playlist
        let playlistHref = currentPlaylistHrefs[playlistIndex];

        // go to the new playlist
        await page.goto(playlistHref);

        // scroll all the way down to load all the uploaded chapters
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    var scrollTop = -1;
                    var ticks = 0;
                    const interval = setInterval(() => {
                        window.scrollBy(0, 100000);
                        if (document.documentElement.scrollTop !== scrollTop) {
                            scrollTop = document.documentElement.scrollTop;
                            ticks = 0;
                            return;
                        } else {
                            ticks++;
                        }
                        if (ticks > 50) {  // 50 ticks = 5 seconds
                            clearInterval(interval);
                            resolve();
                        }
                    }, 100);
                })
        );

        videos = await page.evaluate(() => {
            return Array.from(
                document.querySelectorAll("#video-title"),
                (video) => video.innerText
            );
        });

        console.log(`Got all videos in playlist ${NovelTitle}:`);
        for (let i = 0; i < videos.length; i++) {
            console.log(videos[i]);
        }
    }

    BufferTextFiles(1);
    BufferMp4s();

    await browser.close();
})();

async function BufferTextFiles(CurChapter) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())

    let chapter = CurChapter - 1;
    while (true) {
        chapter++;
        if (videos.includes(`${NovelTitle} chapter ${chapter}`)) {
            console.log(`3 --------------- Chapter ${chapter} already uploaded`);
            continue;
        }
        // if mp4 exists and size !== 0, skip
        if (fs.existsSync(`./mp4s/${NovelTitle} chapter ${chapter}.mp4`) && fs.statSync(`./mp4s/${NovelTitle} chapter ${chapter}.mp4`).size !== 0) {
            console.log(`3 --------------- Chapter ${chapter} already mp4ed`);
            continue;
        }
        // if txt exists, skip
        if (fs.existsSync(`./textfiles/${NovelTitle} chapter ${chapter}.txt`)) {
            console.log(`3 --------------- Chapter ${chapter} already txted`);
            continue;
        }
        console.log(`3 --------------- Grabbing text from chapter ${chapter}...`);
        let chapterUrl = `${NovelLinkPrefix}${chapter}${NovelLinkSuffix}`;
        await page.goto(chapterUrl);

        let texts = [];
        let index = 0;
        while (index < TextPathSelector.length && texts.length === 0) {
            await page.evaluate(
                () =>
                    new Promise((resolve) => {
                        var scrollTop = -1;
                        var ticks = 0;
                        const interval = setInterval(() => {
                            window.scrollBy(0, 100000);
                            if (document.documentElement.scrollTop !== scrollTop) {
                                scrollTop = document.documentElement.scrollTop;
                                ticks = 0;
                                return;
                            } else {
                                ticks++;
                            }
                            if (ticks > 40) {  // 40 ticks = 4 seconds
                                clearInterval(interval);
                                resolve();
                            }
                        }, 100);
                    })
            );
            texts = await page.evaluate((TextPathSelector) => {
                return Array.from(document.querySelectorAll(TextPathSelector))
                    .filter(p => !p.querySelector("a")) // blacklist items
                    .filter(p => !p.querySelector("abbr"))
                    .filter(p => !p.querySelector("area"))
                    .filter(p => !p.querySelector("audio"))
                    .filter(p => !p.querySelector("b"))
                    .filter(p => !p.querySelector("bdi"))
                    .filter(p => !p.querySelector("bdo"))
                    .filter(p => !p.querySelector("br"))
                    .filter(p => !p.querySelector("button"))
                    .filter(p => !p.querySelector("canvas"))
                    .filter(p => !p.querySelector("cite"))
                    .filter(p => !p.querySelector("code"))
                    .filter(p => !p.querySelector("command"))
                    .filter(p => !p.querySelector("datalist"))
                    .filter(p => !p.querySelector("del"))
                    .filter(p => !p.querySelector("dfn"))
                    .filter(p => !p.querySelector("em"))
                    .filter(p => !p.querySelector("embed"))
                    .filter(p => !p.querySelector("i"))
                    .filter(p => !p.querySelector("iframe"))
                    .filter(p => !p.querySelector("img"))
                    .filter(p => !p.querySelector("input"))
                    .filter(p => !p.querySelector("ins"))
                    .filter(p => !p.querySelector("kbd"))
                    .filter(p => !p.querySelector("keygen"))
                    .filter(p => !p.querySelector("label"))
                    .filter(p => !p.querySelector("map"))
                    .filter(p => !p.querySelector("mark"))
                    .filter(p => !p.querySelector("math"))
                    .filter(p => !p.querySelector("meter"))
                    .filter(p => !p.querySelector("noscript"))
                    .filter(p => !p.querySelector("object"))
                    .filter(p => !p.querySelector("output"))
                    .filter(p => !p.querySelector("progress"))
                    .filter(p => !p.querySelector("q"))
                    .filter(p => !p.querySelector("ruby"))
                    .filter(p => !p.querySelector("s"))
                    .filter(p => !p.querySelector("samp"))
                    .filter(p => !p.querySelector("script"))
                    .filter(p => !p.querySelector("select"))
                    .filter(p => !p.querySelector("small"))
                    // .filter(p => !p.querySelector("span"))
                    .filter(p => !p.querySelector("strong"))
                    .filter(p => !p.querySelector("sub"))
                    .filter(p => !p.querySelector("sup"))
                    .filter(p => !p.querySelector("svg"))
                    .filter(p => !p.querySelector("textarea"))
                    .filter(p => !p.querySelector("time"))
                    .filter(p => !p.querySelector("u"))
                    .filter(p => !p.querySelector("var"))
                    .filter(p => !p.querySelector("video"))
                    .filter(p => !p.querySelector("wbr"))
                    .filter(p => !p.querySelector("text"))
                    .map(p => p.innerText);
            }, TextPathSelector[index]);
            index++;
        }
        if (texts.length === 0) {
            console.log(`3 --------------- No text found for chapter ${chapter}`);
            await browser.close();
            BufferTextFiles(chapter);
            return;
        }
        console.log(`3 --------------- Got text for chapter ${chapter}`);

        fs.appendFileSync(`./textfiles/${NovelTitle} chapter ${chapter}.txt`, `${NovelTitle} chapter ${chapter} ${texts.join(" ")}`);
    }

    await browser.close();
}

async function BufferMp4s() {
    var ready = true;
    let chapterNumber = 0;
    while (true) {
        chapterNumber++;
        if (videos.includes(`${NovelTitle} chapter ${chapterNumber}`)) {
            console.log(`2 ---------- Chapter ${chapterNumber} already uploaded`);
            continue;
        }
        // if mp4 exists and size !== 0, skip
        if (fs.existsSync(`./mp4s/${NovelTitle} chapter ${chapterNumber}.mp4`) && fs.statSync(`./mp4s/${NovelTitle} chapter ${chapterNumber}.mp4`).size !== 0) {
            console.log(`2 ---------- Chapter ${chapterNumber} already mp4ed`);
            continue;
        }
        let chapterName = `${NovelTitle} chapter ${chapterNumber}`;
        while (!ready) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        ready = false;
        // wait until ${chapterName}.txt exists in the ./textfiles folder. also ensure that its size is greater than 0 bytes
        console.log(`2 ---------- Waiting for ${chapterName}.txt to be ready...`);
        let filePath = `./textfiles/${chapterName}.txt`;
        while (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        ready = true;

        let mp3Path = `./mp3s/${chapterName}.mp3`;
        let mp4Path = `./mp4s/${chapterName}.mp4`;
        console.log(`2 ---------- Creating ${chapterName}.mp3...`);
        new gTTS(fs.readFileSync(filePath, "utf8"), "en").save(mp3Path, (err) => {
            if (err) { throw err; }
            console.log(`1 ----- Created mp3 for chapter ${chapterNumber}!`);
            console.log(`1 ----- Creating mp4 for chapter ${chapterNumber}...`);
            let duration = getMP3Duration(fs.readFileSync(mp3Path)) * 0.001;
            new ffmpeg(mp3Path)
                .setFfmpegPath(FfmpegPath)
                .input(ImagePath)
                .inputFPS(1 / duration)
                .loop(duration)
                .save(mp4Path)
                .on("end", function () {
                    fs.unlink(mp3Path, (err) => {
                        if (err) { throw err; }
                        console.log(`1 ----- Created mp4 for chapter ${chapterNumber}!`);
                        console.log(`1 ----- Deleting mp3 for chapter ${chapterNumber}...`);
                        fs.unlink(filePath, (err) => {
                            if (err) { throw err; }
                            console.log(`1 ----- Deleted text for chapter ${chapterNumber}!`);
                        });
                    });
                }).on("error", function (err) { throw err; });
        });
    }
}

// upload limit div[class="error-short style-scope ytcp-uploads-dialog"]