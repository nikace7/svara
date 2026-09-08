import sharp from 'sharp';

export async function imageFixture(kind: 'jpeg' | 'png' | 'large' = 'png') {
  const image = sharp({
    create: {
      width: kind === 'large' ? 5001 : 30,
      height: kind === 'large' ? 5000 : 20,
      channels: 3,
      background: '#ece5f7',
    },
  });
  return kind === 'jpeg'
    ? image.jpeg().withMetadata({ orientation: 6 }).toBuffer()
    : image.png().toBuffer();
}

export async function inspectImageFixture(bytes: Buffer) {
  return sharp(bytes).metadata();
}
