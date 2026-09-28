import front from '../../assets/product/device-front.jpg';
import angle from '../../assets/product/device-angle.jpg';
import detail from '../../assets/product/device-detail.jpg';
import exploded from '../../assets/product/device-exploded.jpg';
import usb from '../../assets/product/device-usb.jpg';
import finishes from '../../assets/product/device-finishes.jpg';
import inTheBox from '../../assets/product/in-the-box.jpg';
import podMint from '../../assets/product/pod-mint.jpg';
import podLemon from '../../assets/product/pod-lemon.jpg';
import podBerry from '../../assets/product/pod-berry.jpg';
import type { FlavorId } from '../../models';

export const productImages = {
  front,
  angle,
  detail,
  exploded,
  usb,
  finishes,
  inTheBox,
};

export const podImages: Record<FlavorId, string> = {
  mint: podMint,
  lemon: podLemon,
  berry: podBerry,
};

export const deviceGallery = [
  { src: angle, alt: 'NoVape One, angled view' },
  { src: detail, alt: 'Smoked cartridge cap, close-up' },
  { src: exploded, alt: 'Cartridge and cap, exploded view' },
  { src: usb, alt: 'USB-C charging port' },
  { src: finishes, alt: 'NoVape One in champagne, black, graphite and sage' },
];
