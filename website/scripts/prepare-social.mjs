import sharp from 'sharp';
await sharp(new URL('../public/social.svg', import.meta.url).pathname).png().toFile(new URL('../public/social.png', import.meta.url).pathname);
