import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Time-of-day keyframes: t=0 is 09:00, t=1 is 16:30 (alpenglow).
const KEYS = [
  { t: 0.0, elev: 14, az: -75, top: '#5d97d6', hor: '#ffd9b8', fog: '#d9e4f0', sun: '#ffd6a8', sunI: 2.4, hemiTop: '#bcd4f0', hemiBot: '#e9edf5', hemiI: 1.0 },
  { t: 0.35, elev: 40, az: -30, top: '#3a86de', hor: '#d4e8f8', fog: '#dbe8f5', sun: '#fff4e2', sunI: 3.0, hemiTop: '#c8dcf3', hemiBot: '#eef2f8', hemiI: 1.1 },
  { t: 0.7, elev: 25, az: 25, top: '#4579cc', hor: '#ffe3c0', fog: '#e3e4ec', sun: '#ffdcaa', sunI: 2.7, hemiTop: '#c2d3ee', hemiBot: '#ede9ee', hemiI: 1.0 },
  { t: 1.0, elev: 7, az: 55, top: '#4a5aa8', hor: '#ffa98c', fog: '#e2c3cc', sun: '#ff9460', sunI: 2.5, hemiTop: '#aab4e6', hemiBot: '#f2cdd2', hemiI: 1.05 },
];

const c1 = new THREE.Color(), c2 = new THREE.Color();
function lerpColor(out, a, b, t) { c1.set(a); c2.set(b); return out.copy(c1).lerp(c2, t); }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    this.camera.position.set(0, 300, -60);

    this.fog = new THREE.FogExp2('#dbe8f5', 0.001);
    this.scene.fog = this.fog;
    this.baseFogDensity = 0.001;

    // Sky dome
    this.skyUniforms = {
      topColor: { value: new THREE.Color('#3a86de') },
      horizonColor: { value: new THREE.Color('#d4e8f8') },
      bottomColor: { value: new THREE.Color('#e6eef8') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#fff4e2') },
      time: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * p;
            gl_Position.z = gl_Position.w; // push to far plane
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 topColor, horizonColor, bottomColor, sunDir, sunColor;
          uniform float time;
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.55, h), 0.7));
            col = mix(col, bottomColor, smoothstep(0.0, -0.2, h));
            float sd = max(dot(d, normalize(sunDir)), 0.0);
            col += sunColor * (pow(sd, 1600.0) * 18.0 + pow(sd, 60.0) * 0.45 + pow(sd, 6.0) * 0.18);
            // faint high-altitude streaks
            float streak = smoothstep(0.55, 0.9, sin(d.x * 9.0 + d.z * 4.0 + time * 0.01) * 0.5 + 0.5) * smoothstep(0.1, 0.4, h) * 0.05;
            col += vec3(streak);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);
    // a tiny scene with the same sky + a snowy ground plane, used to bake image-based lighting
    this.envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), sky.material);
    this.envScene.add(envSky);
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(39, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#dfe6ee' }));
    envGround.position.y = -2;
    this.envGround = envGround;
    this.envScene.add(envGround);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTod = -1;
    this.envRT = null;

    // Lights
    this.hemi = new THREE.HemisphereLight('#c8dcf3', '#eef2f8', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e2', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.shadowCenter = new THREE.Vector3();

    // Post processing
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: 0.32 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1.12 },
        uFlash: { value: 0 },
        uTime: { value: 0 },
        uCold: { value: 0 },
      },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uVignette, uSat, uFlash, uTime, uCold; uniform vec3 uTint;
        varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(vec3(l), c.rgb, uSat);
          c.rgb *= uTint;
          // cool shadows, warm highlights (split toning)
          c.rgb += mix(vec3(-0.012, -0.004, 0.02), vec3(0.02, 0.01, -0.012), smoothstep(0.1, 0.9, l)) * 0.8;
          vec2 q = vUv - 0.5;
          float v = 1.0 - dot(q, q) * uVignette * 2.2;
          c.rgb *= clamp(v, 0.0, 1.0);
          c.rgb = mix(c.rgb, vec3(1.0, 0.97, 0.9) * 2.0, uFlash);
          c.rgb = mix(c.rgb, vec3(l) * vec3(0.85, 0.95, 1.2), uCold);
          c.rgb += (rnd(vUv * 731.0) - 0.5) * 0.012;
          gl_FragColor = c;
        }`,
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.quality = 'high';
    this.tod = 0.5;
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bloom.enabled = q !== 'low';
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTimeOfDay(t, weather = 0) {
    this.tod = t;
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.elev, b.elev, f));
    const az = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.az, b.az, f));
    // azimuth 0 = sun down the valley (+z, in front of a skier looking downhill), positive = toward +x
    this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
    this.skyUniforms.sunDir.value.copy(this.sunDir);
    lerpColor(this.skyUniforms.topColor.value, a.top, b.top, f);
    lerpColor(this.skyUniforms.horizonColor.value, a.hor, b.hor, f);
    lerpColor(this.skyUniforms.sunColor.value, a.sun, b.sun, f);
    lerpColor(this.fog.color, a.fog, b.fog, f);
    this.skyUniforms.bottomColor.value.copy(this.fog.color);
    lerpColor(this.sun.color, a.sun, b.sun, f);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, f) * (1 - weather * 0.3);
    lerpColor(this.hemi.color, a.hemiTop, b.hemiTop, f);
    lerpColor(this.hemi.groundColor, a.hemiBot, b.hemiBot, f);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, f);
    // weather greys out the sky and thickens fog
    if (weather > 0) {
      const grey = new THREE.Color('#c9d2de');
      this.skyUniforms.topColor.value.lerp(grey, weather * 0.35);
      this.skyUniforms.horizonColor.value.lerp(grey, weather * 0.3);
      this.fog.color.lerp(grey, weather * 0.3);
    }
    this.fog.density = this.baseFogDensity * (1 + weather * 0.9);
    this.hemi.intensity *= 0.55; // most ambient light now comes from the sky environment map
    if (Math.abs(t - this.envTod) > 0.012 || this.envWeather !== Math.round(weather * 10)) this.updateEnvironment(t, weather);
  }

  updateEnvironment(t, weather) {
    this.envTod = t;
    this.envWeather = Math.round(weather * 10);
    this.envGround.material.color.copy(this.fog.color).lerp(new THREE.Color('#ffffff'), 0.4);
    const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.75;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
  }

  followShadow(center) {
    // snap the shadow frustum to texels to avoid shimmering
    const texel = 140 / this.sun.shadow.mapSize.x;
    this.shadowCenter.set(Math.round(center.x / texel) * texel, Math.round(center.y / texel) * texel, Math.round(center.z / texel) * texel);
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.position.copy(this.shadowCenter).addScaledVector(this.sunDir, 400);
  }

  render(dt, time) {
    this.sky.position.copy(this.camera.position);
    this.skyUniforms.time.value = time;
    this.grade.uniforms.uTime.value = time % 100;
    this.grade.uniforms.uFlash.value = Math.max(0, this.grade.uniforms.uFlash.value - dt * 2.5);
    if (this.quality === 'low') {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render(dt);
    }
  }
}
