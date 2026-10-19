import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 120_000,
    workers: 1,
    retries: 0,
    // In CI, also report failures as GitHub annotations so they're readable without the logs.
    reporter: process.env.CI ? [['list'], ['github']] : [['list']],
    use: {
        baseURL: 'http://localhost:8069',
        viewport: {width: 1400, height: 900},
        timezoneId: 'Europe/Istanbul',
        channel: 'chrome',
    },
});
