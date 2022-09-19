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
process.setMaxListeners(2);
const MaxMp3Workers = 1;
let videos = [];

async function waitForSelector(page, selector, timeout = 50) {  // 50 ticks = 5 seconds
    return await page.evaluate((selector, timeout) =>
        new Promise((resolve) => {
            var ticks = 0;
            const interval = setInterval(() => {
                if (document.querySelector(selector)) {
                    clearInterval(interval);
                    resolve(true);
                } else {
                    ticks++;
                }
                if (ticks > timeout) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 100);
        }), selector, timeout);
}

puppeteer.launch({ headless: false }).then(async browser => {
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
    console.log("\nLogged in");

    // move the mouse in case the mouse is hovering on top of the playlist button
    await page.mouse.move(100000, 100000);

    await page.waitForSelector('h3[class="playlist-title style-scope ytcp-playlist-row"]');
    let currentPlaylistTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
    });
    console.log("\nCurrent playlists:");
    for (let i = 0; i < currentPlaylistTitles.length; i++) {
        console.log(currentPlaylistTitles[i]);
    }

    if (!currentPlaylistTitles.includes(NovelTitle)) {
        await page.waitForSelector('ytcp-button[id="new-playlist-button"]');
        await page.click('ytcp-button[id="new-playlist-button"]');

        await page.waitForSelector('textarea[class="style-scope ytcp-form-textarea"]');
        await page.type('textarea[class="style-scope ytcp-form-textarea"]', NovelTitle);

        await page.waitForSelector('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
        await page.click('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');

        await page.waitForSelector('tp-yt-paper-item[test-id="UNLISTED"]');
        await page.click('tp-yt-paper-item[test-id="UNLISTED"]');

        await page.waitForSelector('ytcp-button[id="create-button"]');
        await page.click('ytcp-button[id="create-button"]');

        while (!currentPlaylistTitles.includes(NovelTitle)) {
            await new Promise(resolve => setTimeout(resolve, 100));
            currentPlaylistTitles = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
            });
        }
        console.log(`\nCreated playlist "${NovelTitle}"`);
    } else {
        let playlistIndex = currentPlaylistTitles.indexOf(NovelTitle);
        await page.waitForSelector('div[id="hover-items"] > a:nth-child(1)');
        let currentPlaylistHrefs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div[id="hover-items"] > a:nth-child(1)')).map(p => p.href);
        });
        let playlistHref = currentPlaylistHrefs[playlistIndex];
        await page.goto(playlistHref);
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
                }));

        videos = await page.evaluate(() => {
            return Array.from(
                document.querySelectorAll("#video-title"),
                (video) => video.innerText
            );
        });

        console.log("\nCurrent videos:");
        for (let i = 0; i < videos.length; i++) {
            console.log(videos[i]);
        }
        console.log("\n");
    }

    BufferTextfiles();
    BufferMp4s();

    let chapter = 1;
    while (true) {
        let chapterTitle = `${NovelTitle} chapter ${chapter}`;

        if (videos.includes(chapterTitle)) {
            console.log(`${chapterTitle} already in videos`);
            chapter++;
            continue;
        }

        let mp4Path = `./mp4s/${chapterTitle}.mp4`;
        while (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await page.goto("https://www.youtube.com/upload");
        const elementHandle = await page.$('input[type="file"]');
        await elementHandle.uploadFile(mp4Path);

        await page.waitForSelector(
            'ytcp-dropdown-trigger[class="use-placeholder style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]'
        );
        await page.click(
            'ytcp-dropdown-trigger[class="use-placeholder style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]'
        );

        let playlistTitles = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('span[class="label label-text style-scope ytcp-checkbox-group"]')).map(p => p.innerText);
        });
        for (let i = 0; i < playlistTitles.length; i++) {
            console.log(playlistTitles[i]);
        }

        let playlistIndex = playlistTitles.indexOf(NovelTitle);
        console.log(`\nFound playlist "${NovelTitle}" at index ${playlistIndex}`);

        await page.waitForSelector(`ytcp-ve[class="style-scope ytcp-checkbox-group"]:nth-child(${playlistIndex + 2})`);
        await page.click(`ytcp-ve[class="style-scope ytcp-checkbox-group"]:nth-child(${playlistIndex + 2})`);

        await page.waitForSelector(
            'ytcp-button[class="done-button action-button style-scope ytcp-playlist-dialog"]'
        );
        await page.click(
            'ytcp-button[class="done-button action-button style-scope ytcp-playlist-dialog"]'
        );

        await page.waitForSelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
        await page.click('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');

        await page.waitForSelector("#step-badge-3");
        await page.click("#step-badge-3");

        await page.waitForSelector('tp-yt-paper-radio-button[name="UNLISTED"]');
        await page.click('tp-yt-paper-radio-button[name="UNLISTED"]');

        await page.waitForSelector("#done-button");
        await page.click("#done-button");

        await page.waitForSelector('ytcp-button[id="close-button"]');
        console.log(`Uploaded ${chapterTitle}`);
        videos.push(chapterTitle);
        fs.unlinkSync(mp4Path);
        chapter++;
    }

    await browser.close();
});

async function BufferTextfiles() {
    puppeteer.launch({ headless: true }).then(async browser => {
        let page = await browser.newPage();
        await page.setUserAgent(userAgent.toString());

        let chapter = 1;
        while (true) {
            let chapterTitle = `${NovelTitle} chapter ${chapter}`;

            if (videos.includes(chapterTitle)) {
                console.log(`\t\t\t${chapterTitle} already in videos`);
                chapter++;
                if (fs.existsSync(`./textfiles/${chapterTitle}.txt`)) {
                    fs.unlinkSync(`./textfiles/${chapterTitle}.txt`);
                }
                continue;
            }
            if (fs.existsSync(`./mp4s/${chapterTitle}.mp4`) && fs.statSync(`./mp4s/${chapterTitle}.mp4`).size !== 0) {
                console.log(`\t\t\t${chapterTitle} already in mp4s`);
                chapter++;
                if (fs.existsSync(`./textfiles/${chapterTitle}.txt`)) {
                    fs.unlinkSync(`./textfiles/${chapterTitle}.txt`);
                }
                continue;
            }
            if (fs.existsSync(`./textfiles/${chapterTitle}.txt`) && fs.statSync(`./textfiles/${chapterTitle}.txt`).size !== 0) {
                console.log(`\t\t\t${chapterTitle} already in textfiles`);
                chapter++;
                continue;
            }

            await page.goto(`${NovelLinkPrefix}${chapter}${NovelLinkSuffix}`);
            let texts = [];
            let index = 0;
            while (index < TextPathSelector.length && texts.length === 0) {
                if (await waitForSelector(page, TextPathSelector[index], 100)) {    // 10 seconds
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
                }
                index++;
            }

            if (texts.length === 0) {
                console.log(`\t\t\terror getting ${chapterTitle}`);
                browser.close();
                browser = await puppeteer.launch({ headless: true });
                page = await browser.newPage();
                await page.setUserAgent(userAgent.toString());
                continue;
            }

            console.log(`\t\t\t${chapterTitle} textfile saved`);
            fs.writeFile(`./textfiles/${chapterTitle}.txt`, `${chapterTitle} ${texts.join(" ")}`, (err) => { });
            chapter++;
        }
    });
}

async function BufferMp4s() {
    fs.readdirSync("./mp3s").forEach(file => {
        fs.unlinkSync(`./mp3s/${file}`);
    });

    let numWorkers = 0;
    let chapter = 1;
    while (true) {
        while (numWorkers >= MaxMp3Workers) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        numWorkers++;

        let chapterTitle = `${NovelTitle} chapter ${chapter}`;
        let mp4Path = `./mp4s/${chapterTitle}.mp4`;
        chapter++;

        if (videos.includes(chapterTitle)) {
            console.log(`\t\t${chapterTitle} already in videos`);
            if (fs.existsSync(mp4Path)) {
                fs.unlinkSync(mp4Path);
            }
            numWorkers--;
            continue;
        }

        if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size !== 0) {
            console.log(`\t\t${chapterTitle} already in mp4s`);
            numWorkers--;
            continue;
        }

        let mp3Path = `./mp3s/${chapterTitle}.mp3`;
        let textfilePath = `./textfiles/${chapterTitle}.txt`;

        while (!fs.existsSync(textfilePath)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await new gTTS(fs.readFileSync(textfilePath, "utf8"), "en").save(mp3Path, () => {
            console.log(`\t\t${chapterTitle} mp3 saved`);
            let duration = getMP3Duration(fs.readFileSync(mp3Path)) * 0.001;
            new ffmpeg(mp3Path)
                .setFfmpegPath(FfmpegPath)
                .input(ImagePath)
                .inputFPS(1 / duration)
                .loop(duration)
                .save(mp4Path)
                .on("end", () => {
                    fs.unlinkSync(textfilePath);
                    fs.unlinkSync(mp3Path);
                    console.log(`\t${chapterTitle} mp4 saved`);
                    numWorkers--;
                });
        });
    }
}