const Jimp = require('jimp');

async function resizeIcon() {
    try {
        const image = await Jimp.read('C:/Users/minse/Desktop/Chzzk_Follow_Alarm_Improved/public/dodoroi_icon.png');
        console.log(`Original Dimensions: ${image.bitmap.width}x${image.bitmap.height}`);

        // Resize to 512x512 using Nearest Neighbor to keep it sharp (pixel art style)
        image.resize(512, 512, Jimp.RESIZE_NEAREST_NEIGHBOR);

        await image.writeAsync('public/dodoroi_icon.png');
        console.log('Icon upscaled (Nearest Neighbor) and saved to public/dodoroi_icon.png');
    } catch (err) {
        console.error('Error processing icon:', err);
    }
}

resizeIcon();
