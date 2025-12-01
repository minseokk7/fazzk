const Jimp = require('jimp');

async function checkSize() {
    try {
        const image = await Jimp.read('C:/Users/minse/.gemini/antigravity/brain/25c3442b-6d7d-4721-88bb-c38ce6fe6a82/uploaded_image_1764579757000.png');
        console.log(`Original Dimensions: ${image.bitmap.width}x${image.bitmap.height}`);
    } catch (err) {
        console.error(err);
    }
}

checkSize();
