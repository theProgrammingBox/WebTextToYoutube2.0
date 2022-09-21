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
const Email = process.env.EMAIL.split(",");
const Password = process.env.PASSWORD.split(",");
const NovelTitle = process.env.NOVEL_TITLE;
const NovelLinkPrefix = process.env.NOVEL_LINK_PREFIX;
const NovelLinkSuffix = process.env.NOVEL_LINK_SUFFIX;
const TextPathSelector = process.env.TEXT_PATH_SELECTOR.split(",");
process.setMaxListeners(2);
const MaxMp3Workers = 16;
let videos = [];
let firstLoop = true;

async function WaitForSelector(page, selector, timeout = 60) {  // 60 ticks = 6 seconds
    return await page.evaluate((selector, timeout) =>
        new Promise((resolve) => {
            var ticks = 0;
            const interval = setInterval(() => {
                if (document.querySelector(selector).offsetParent) {    // visible element
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

async function WaitForFile(fileName, timeout = 40) {  // 40 ticks = 4 seconds
    while (!fs.existsSync(fileName)) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    let size = fs.statSync(fileName).size;
    let currSize = size;
    let tick = 0;
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 100));
        currSize = fs.statSync(fileName).size;
        if (size != currSize) {
            size = currSize;
            tick = 0;
        } else if (++tick > timeout) {
            break;
        }
    }
}

async function ScrollToBottom(page, timeout = 60) {  // 60 ticks = 6 seconds
    await page.evaluate((timeout) =>
        new Promise((resolve) => {
            var scrollTop = -1;
            var ticks = 0;
            const interval = setInterval(() => {
                window.scrollBy(0, 100000);
                if (document.documentElement.scrollTop !== scrollTop) {
                    scrollTop = document.documentElement.scrollTop;
                    ticks = 0;
                } else {
                    ticks++;
                }
                if (ticks > timeout) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        }), timeout);
}

// (async () => {
//     let chapterTitle = `${NovelTitle} chapter ${5}`;
//     let mp3Path = `./mp3s/${chapterTitle}.mp3`;
//     let textfilePath = `./textfiles/${chapterTitle}.txt`;
//     await WaitForFile(textfilePath);
//     console.log(`\t\t${chapterTitle} mp3 saved`);
//     await new gTTS(fs.readFileSync(textfilePath, "utf8"), "en").save(mp3Path);
//     await WaitForFile(mp3Path);
//     console.log(`\t\t${chapterTitle} mp3 saved`);
// })();

// return;

puppeteer.launch({ headless: false }).then(async browser => {
    fs.readdirSync("./errorlogs").forEach(file => {
        fs.unlinkSync(path.join("./errorlogs", file));
    });
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

    let page = await browser.newPage();
    let accountIndex = 0;
    while (true) {
        await page.close();
        page = await browser.newPage();
        // await page.setUserAgent(userAgent.toString());
        // use chrome and see if that stops the popup

        if (++accountIndex >= Email.length) {
            accountIndex = 0;
        }

        await page.goto("https://studio.youtube.com/channel/UC/playlists");
        if (await WaitForSelector(page, 'input[type="email"]')) {
            await page.type('input[type="email"]', Email[accountIndex]);
            await page.keyboard.press("Enter");
        } else {
            await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
            continue;
        }

        if (await WaitForSelector(page, 'input[type="password"]')) {
            await page.type('input[type="password"]', Password[accountIndex]);
            await Promise.all([
                page.waitForNavigation(),
                await page.keyboard.press("Enter"),
            ]);
        } else {
            await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
            continue;
        }

        console.log("\nLogged in");

        // move the mouse in case the mouse is hovering on top of the playlist button
        await page.mouse.move(100000, 100000);

        let currentPlaylistTitles = [];
        if (await WaitForSelector(page, 'h3[class="playlist-title style-scope ytcp-playlist-row"]')) {
            currentPlaylistTitles = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
            });
            console.log("\nCurrent playlists:");
            for (let i = 0; i < currentPlaylistTitles.length; i++) {
                console.log(currentPlaylistTitles[i]);
            }
        } else {
            console.log("No playlists found");
        }

        if (!currentPlaylistTitles.includes(NovelTitle)) {
            // await page.WaitForSelector(page, 'ytcp-button[id="new-playlist-button"]');
            if (await WaitForSelector(page, 'ytcp-button[id="new-playlist-button"]')) {
                await page.click('ytcp-button[id="new-playlist-button"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'textarea[class="style-scope ytcp-form-textarea"]');
            if (await WaitForSelector(page, 'textarea[class="style-scope ytcp-form-textarea"]')) {
                await page.type('textarea[class="style-scope ytcp-form-textarea"]', NovelTitle);
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
            if (await WaitForSelector(page, 'ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]')) {
                await page.click('ytcp-dropdown-trigger[class=" has-label style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'tp-yt-paper-item[test-id="PRIVATE"]');
            if (await WaitForSelector(page, 'tp-yt-paper-item[test-id="PRIVATE"]')) {
                await page.click('tp-yt-paper-item[test-id="PRIVATE"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'ytcp-button[id="create-button"]');
            if (await WaitForSelector(page, 'ytcp-button[id="create-button"]')) {
                await page.click('ytcp-button[id="create-button"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            while (!currentPlaylistTitles.includes(NovelTitle)) {
                await new Promise(resolve => setTimeout(resolve, 100));
                currentPlaylistTitles = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('h3[class="playlist-title style-scope ytcp-playlist-row"]')).map(p => p.innerText);
                });
            }
            console.log(`\nCreated playlist "${NovelTitle}"`);
        } else {
            let playlistIndex = currentPlaylistTitles.indexOf(NovelTitle);
            // await page.WaitForSelector(page, 'div[id="hover-items"] > a:nth-child(1)');
            let currentPlaylistHrefs;
            if (await WaitForSelector(page, 'div[id="hover-items"] > a:nth-child(1)')) {
                currentPlaylistHrefs = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('div[id="hover-items"] > a:nth-child(1)')).map(p => p.href);
                });
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }
            let playlistHref = currentPlaylistHrefs[playlistIndex];
            await page.goto(playlistHref);

            await ScrollToBottom(page);

            if (await WaitForSelector(page, "#video-title")) {
                videos = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll("#video-title")).map(p => p.href);
                });

                console.log("\nCurrent videos:");
                for (let i = 0; i < videos.length; i++) {
                    console.log(videos[i]);
                }
                console.log("\n");
            } else {
                console.log("No videos found\n");
            }
        }
        return;

        if (firstLoop) {
            fs.readdirSync("./textfiles").forEach(file => {
                fs.unlinkSync(`./textfiles/${file}`);
            });
            fs.readdirSync("./mp3s").forEach(file => {
                fs.unlinkSync(`./mp3s/${file}`);
            });
            fs.readdirSync("./mp4s").forEach(file => {
                fs.unlinkSync(`./mp4s/${file}`);
            });
            BufferTextfiles(); // run these at the same time
            BufferMp3s();
            BufferMp4s();
            firstLoop = false;
        }

        let chapter = 1;
        while (true) {
            let chapterTitle = `${NovelTitle} chapter ${chapter}`;

            if (videos.includes(chapterTitle)) {
                console.log(`${chapterTitle} already in videos`);
                chapter++;
                continue;
            }

            let mp4Path = `./mp4s/${chapterTitle}.mp4`;
            await WaitForFile(mp4Path);

            await page.goto("https://www.youtube.com/upload");
            if (await WaitForSelector(page, 'input[type="file"]')) {
                await page.$('input[type="file"]').uploadFile(mp4Path);
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }
            // const elementHandle = await page.$('input[type="file"]');
            // await elementHandle.uploadFile(mp4Path);

            // await page.WaitForSelector(page, 
            //     'ytcp-dropdown-trigger[class="use-placeholder style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]'
            // );
            if (await WaitForSelector(page, 'ytcp-dropdown-trigger[class="use-placeholder style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]')) {
                await page.click('ytcp-dropdown-trigger[class="use-placeholder style-scope ytcp-text-dropdown-trigger style-scope ytcp-text-dropdown-trigger"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            let playlistTitles = [];
            if (await WaitForSelector(page, 'span[class="label label-text style-scope ytcp-checkbox-group"]')) {
                playlistTitles = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('span[class="label label-text style-scope ytcp-checkbox-group"]')).map(p => p.innerText);
                });
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            let playlistIndex = playlistTitles.indexOf(NovelTitle);

            // await page.WaitForSelector(page, `#checkbox-${playlistIndex}`);
            if (await WaitForSelector(page, `#checkbox-${playlistIndex}`)) {
                await page.click(`#checkbox-${playlistIndex}`);
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 
            //     'ytcp-button[class="done-button action-button style-scope ytcp-playlist-dialog"]'
            // );
            if (await WaitForSelector(page, 'ytcp-button[class="done-button action-button style-scope ytcp-playlist-dialog"]')) {
                await page.click('ytcp-button[class="done-button action-button style-scope ytcp-playlist-dialog"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
            if (await WaitForSelector(page, 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]')) {
                await page.click('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, "#step-badge-3");
            if (await WaitForSelector(page, "#step-badge-3")) {
                await page.click("#step-badge-3");
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'tp-yt-paper-radio-button[name="PRIVATE"]');
            if (await WaitForSelector(page, 'tp-yt-paper-radio-button[name="PRIVATE"]')) {
                await page.click('tp-yt-paper-radio-button[name="PRIVATE"]');
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, "#done-button");
            if (await WaitForSelector(page, "#done-button")) {
                await page.click("#done-button");
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }

            // await page.WaitForSelector(page, 'ytcp-button[id="close-button"]');
            if (await WaitForSelector(page, 'ytcp-button[id="close-button"]')) {
                console.log(`Uploaded ${chapterTitle}`);
                videos.push(chapterTitle);
                fs.unlinkSync(mp4Path);
                chapter++;
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                continue;
            }
        };
    };
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
                if (await WaitForSelector(page, TextPathSelector[index])) {
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

            if (texts.length !== 0) {
                console.log(`\t\t\t${chapterTitle} textfile saved`);
                fs.writeFile(`./textfiles/${chapterTitle}.txt`, `${chapterTitle} ${texts.join(" ")}`, (err) => { });
                chapter++;
            } else {
                await page.screenshot({ path: `./errorlogs/${Date.now()}.png` });
                console.log(`\t\t\tError getting ${chapterTitle} textfile`);
                browser.close();
                browser = await puppeteer.launch({ headless: true });
                page = await browser.newPage();
                await page.setUserAgent(userAgent.toString());
                continue;
            }
        }
    });
}

async function BufferMp4s() {
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

        await WaitForFile(textfilePath);

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