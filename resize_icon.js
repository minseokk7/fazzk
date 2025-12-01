const Jimp = require('jimp');

async function resizeIcon() {
    try {
        const image = await Jimp.read('C:/Users/minse/.gemini/antigravity/brain/25c3442b-6d7d-4721-88bb-c38ce6fe6a82/uploaded_image_1764579757000.png');

        // Resize to 512x512
        image.resize(512, 512);

        await image.writeAsync('public/dodoroi_icon.png');
        console.log('Icon resized and saved to public/dodoroi_icon.png');
    } catch (err) {
        console.error(err);
    }
}

resizeIcon();
