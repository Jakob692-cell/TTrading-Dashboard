import front from '../../assets/product/device-front.jpg';
import inTheBox from '../../assets/product/in-the-box.jpg';
import podMint from '../../assets/product/pod-mint.jpg';
import podLemon from '../../assets/product/pod-lemon.jpg';
import podBerry from '../../assets/product/pod-berry.jpg';
import type { FlavorId } from '../../models';

/** Photos stay as fallbacks where WebGL is unavailable and while the 3D engine loads. */
export const productImages = {
  front,
  inTheBox,
};

export const podImages: Record<FlavorId, string> = {
  mint: podMint,
  lemon: podLemon,
  berry: podBerry,
};
