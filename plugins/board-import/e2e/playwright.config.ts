import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 180_000,
    // The first page load can be slow (Mattermost's web app is several MB), so wait longer
    // than the default 5 s for things to appear.
    expect: {timeout: 30_000},
    workers: 1,
    retries: 0,
    // In CI, also report failures as GitHub annotations so they're readable without the logs.
    reporter: process.env.CI ? [['list'], ['github']] : [['list']],
    use: {
        baseURL: 'http://localhost:8072',
        viewport: {width: 1400, height: 900},
        timezoneId: 'Europe/Istanbul',
        channel: 'chrome',
    },
});
