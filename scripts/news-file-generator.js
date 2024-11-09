import * as helper from "./issues/helper.js";
import axios from "axios";
import * as cheerio from 'cheerio';
import {writeFile} from 'fs/promises';
import url from "url";
import path from "path";
import fs from "fs";
import YAML from "yaml";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getExtensionFromMimeType(mimeType) {
    const mimeMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/tiff': 'tiff'
    };

    return mimeMap[mimeType] || '';
}

async function downloadImage(link, filePath) {
    let ext = "";
    await axios({
        url: link,
        method: 'GET',
        responseType: 'stream'
    }).then(response => {
        const mimeType = response.headers['content-type'];
        const extension = getExtensionFromMimeType(mimeType);

        if (!extension) {
            console.error('Unable to determine the file extension.');
            return;
        }

        const fileName = `${filePath}.${extension}`
        response.data.pipe(fs.createWriteStream(fileName));
        console.log(`Image saved to ${fileName}`);

        ext = extension;
    });

    return ext;
}

async function getOgImage(url) {
    try {
        const {data: html} = await axios.get(url);
        const $ = cheerio.load(html);

        const ogImage = $('meta[property="og:image"]').attr('content');

        return ogImage || null;
    } catch (error) {
        console.error('Error fetching the og:image:', error);
        return null;
    }
}

async function getFavicon(url) {
    try {
        const {data: html} = await axios.get(url);
        const $ = cheerio.load(html);

        const faviconUrl =
            $('link[rel="icon"]').attr('href') ||
            $('link[rel="shortcut icon"]').attr('href') ||
            '/favicon.ico';

        return new URL(faviconUrl, url).href;
    } catch (error) {
        console.error('Error fetching the favicon:', error);
        return null;
    }
}

function getExtensionFromUrl(url) {
    const extension = path.extname(new URL(url).pathname);
    return extension || '.ico';
}

async function saveFavicon(data, outputDirectory) {
    const faviconUrl = await getFavicon(data.link);
    if (!faviconUrl) {
        console.error("Couldn't find a favicon.");
        return;
    }

    try {
        const response = await axios.get(faviconUrl, {responseType: 'arraybuffer'});

        const extension = getExtensionFromUrl(faviconUrl);
        const filename = `${new URL(faviconUrl).hostname}${extension}`;
        const outputPath = path.join(outputDirectory, filename);

        await writeFile(outputPath, response.data);
        data.icon = `${filename}`;
        console.log(`Favicon saved to ${outputPath}`);
    } catch (error) {
        console.error('Error saving the favicon:', error);
    }
}

async function saveImages(data) {
    const filename = helper.hashUrlToFilename(data.link);
    const coversDir = path.join(__dirname, '..', 'images', 'news', 'covers');
    const iconsDir = path.join(__dirname, '..', 'images', 'news', 'icons');

    const downloadCover = async () => {
        const filePath = path.join(coversDir, filename);

        let link = null;
        await getOgImage(data.link).then((image) => {
            link = image;
        });

        if (link === null) {
            data.image = null;
        } else {
            console.log(`Downloading ${link} to ${filePath}`);
            await downloadImage(link, filePath).then(extension => {
                data.image = `${filename}.${extension}`;
            });
        }
    };

    await downloadCover();
    await saveFavicon(data, iconsDir);
}

async function getTitleAndDescription(parsedData) {
    try {
        const {data} = await axios.get(parsedData.link);
        const $ = cheerio.load(data);

        const title = $('title').text();
        const ogDescription = $('meta[property="og:description"]').attr('content');
        const description = $('meta[name="description"]').attr('content');

        parsedData.title = title;
        parsedData.description = ogDescription || description || '';
    } catch (error) {
        console.error(`Error fetching data from ${parsedData.link}:`, error.message);
        return null;
    }
}

const main = async () => {
    const body = process.env.ISSUE_BODY;

    const parsedData = helper.parseIssue(body);

    await saveImages(parsedData);
    await getTitleAndDescription(parsedData);

    const data = {
        edition: parsedData.edition,
        title: parsedData.title,
        image: parsedData.image,
        description: parsedData.description,
        icon: parsedData.icon,
        link: parsedData.link,
    };

    const filename = helper.hashUrlToFilename(data.link);
    const articleFilePath = path.join(__dirname, '..', '_news', `${parsedData.date}-${filename}.md`);
    const yamlContent = YAML.stringify(data, {lineWidth: 0});
    const text = `---\n${yamlContent}---`;
    fs.writeFileSync(articleFilePath, text);
};

main();
