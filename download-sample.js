import fs from 'fs';
import https from 'https';

const url = 'https://www.w3schools.com/html/mov_bbb.mp4';
const file = fs.createWriteStream('sample_live_video.mp4');

console.log('Downloading sample video from W3Schools...');

https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download: Server returned status code ${response.statusCode}`);
    process.exit(1);
  }
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Download completed. sample_live_video.mp4 saved successfully.');
    process.exit(0);
  });
}).on('error', (err) => {
  fs.unlink('sample_live_video.mp4', () => {});
  console.error('Network download failed:', err.message);
  process.exit(1);
});
