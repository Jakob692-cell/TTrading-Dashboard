import { PushedHeader } from '../components/navigation/TabBar';
import { ProgressBar, SectionHeader } from '../components/ui/primitives';
import { podImages } from '../components/device/productImages';
import { Scene3D, Still3D } from '../components/three/Scene3D';
import type { Flavor } from '../models';

/** Backdrop in the flavour's own light tint, a touch darker at the floor. */
const podBackdrop = (f: Flavor): [string, string] => [f.tint, shade(f.tint, 0.93)];
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
import { useActions, useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { useUi } from '../state/Ui';
import { flavorById } from '../data/catalog';

export function FlavorsScreen() {
  const { cartridge, flavors } = useData();
  const d = useDerived();
  const actions = useActions();
  const { toast } = useUi();
  const current = cartridge ? flavorById(cartridge.flavorId) : null;

  const perDay = d.avg7 ?? 0;
  const usesLeft = cartridge ? (cartridge.remainingPct / 100) * cartridge.usesPerCartridge : 0;
  const daysLeft = perDay > 0 ? Math.round(usesLeft / perDay) : null;

  return (
    <>
      <PushedHeader back="Back" title="Cartridges" subtitle="Nicotine-free aroma. No vapor." />

      {cartridge && current && (
        <section className="card card--lg stack enter" style={{ gap: 18, ['--i' as string]: 1 }} aria-labelledby="current-cartridge">
          <h2 className="label" id="current-cartridge">
            Current cartridge
          </h2>
          <div className="row" style={{ gap: 18 }}>
            <Scene3D
              className="pod-thumb pod-thumb--lg pod-thumb--live"
              spec={{ kind: 'pod', flavor: current.id }}
              options={{ backdrop: podBackdrop(current), motion: 'spin', interactive: true }}
              label={`${current.name} cartridge, 3D`}
              fallback={<img src={podImages[current.id]} alt="" />}
            />
            <div className="stack grow" style={{ gap: 4 }}>
              <span className="title-md">{current.name}</span>
              <span className="small muted" style={{ fontSize: 14 }}>
                {current.notes}
              </span>
            </div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between" style={{ fontSize: 14 }}>
              <span className="muted">Estimated remaining</span>
              <span style={{ fontWeight: 600 }}>{Math.round(cartridge.remainingPct)}%</span>
            </div>
            <ProgressBar value={cartridge.remainingPct / 100} color={current.accent} label="Cartridge remaining" />
            {daysLeft != null && (
              <span className="small muted">About {daysLeft} days at your current pace — and it lasts longer as you need it less.</span>
            )}
            {cartridge.remainingPct <= 15 && (
              <span className="small" style={{ color: 'var(--warning)' }}>
                Almost empty — the aroma gets fainter from here. Swap in a fresh cartridge when you’re ready.
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={async () => {
              const next = cartridge.nextFlavorId ? flavorById(cartridge.nextFlavorId).name : current.name;
              await actions.insertCartridge();
              toast(`Fresh ${next} cartridge — counter reset`);
            }}
          >
            I inserted a new cartridge
          </button>
        </section>
      )}

      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="Flavors" />
        <div className="stack" style={{ gap: 10 }}>
          {flavors.map((f) => {
            const inUse = cartridge?.flavorId === f.id;
            const next = cartridge?.nextFlavorId === f.id;
            return (
              <div key={f.id} className="flavor-card">
                <span className="pod-thumb" style={{ background: f.tint }}>
                  <Still3D spec={{ kind: 'pod', flavor: f.id }} width={56} height={72} backdrop={podBackdrop(f)} alt="" fallback={podImages[f.id]} />
                </span>
                <div className="stack grow" style={{ gap: 4 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{f.name}</span>
                    <span className="flavor-accent" style={{ background: f.accent }} />
                  </span>
                  <span className="small muted" style={{ fontSize: 13.5 }}>
                    {f.notes}
                  </span>
                </div>
                {inUse ? (
                  <span className="pill pill--accent">In use</span>
                ) : next ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    style={{ height: 32, fontSize: 12.5 }}
                    onClick={() => actions.setNextFlavor(null)}
                    aria-label={`${f.name} is up next. Tap to undo`}
                  >
                    Up next ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ height: 32, fontSize: 12.5, padding: '0 12px' }}
                    onClick={async () => {
                      await actions.setNextFlavor(f.id);
                      toast(`${f.name} set as your next cartridge`);
                    }}
                  >
                    Set as next
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="fineprint" style={{ margin: '16px 4px 0' }}>
          We’ll let you know when your cartridge is running low — never to encourage using it more.
        </p>
      </section>
    </>
  );
}
