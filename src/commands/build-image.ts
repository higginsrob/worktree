import { buildImage } from '../docker.js';
import { IMAGE_NAME } from '../config.js';

export async function buildImageAction(): Promise<void> {
  console.log(`Building ${IMAGE_NAME} ...`);
  await buildImage();
  console.log(`Built ${IMAGE_NAME}`);
}
