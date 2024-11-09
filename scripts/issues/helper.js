import crypto from 'crypto';

export function parseIssue(issueText) {
    const lines = issueText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const findValueAfterHeading = (heading) => {
        const index = lines.indexOf(heading) + 1;
        return index <= lines.length ? lines[index] : '';
    };

    const link = findValueAfterHeading("### News appearance link");
    const edition = findValueAfterHeading("### From which edition is it from?");

    return {
        link: link,
        edition: edition,
    };

}

export function hashUrlToFilename(url) {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}
