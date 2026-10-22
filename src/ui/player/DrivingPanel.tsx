import { NO_DATA, NO_DATA_WHY } from '../../app/messages';
import { appStore, playStore } from '../../app/state';
import { useStore } from '../../app/store';
import { autopilotLabel, gearLetter, gearTone, speedValue, steeringEngaged, unitLabel } from '../format';
import { ArrowLeftIcon, ArrowRightIcon, SteeringWheelIcon } from '../icons';

function steeringText(deg: number): string {
  const a = Math.round(Math.abs(deg));
  if (a === 0) return 'Steering straight';
  return `Steering ${a}° ${deg > 0 ? 'right' : 'left'}`;
}

/** Accelerator pedal outline that fills from the bottom with pedal position. */
function Pedal({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const h = (15 * p) / 100;
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="8" y="4" width="8" height="16" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y={19.5 - h} width="6" height={h} rx="1.4" fill="currentColor" className="dp-pedal-fill" />
    </svg>
  );
}

/** Brake pedal outline, filled while the brake is on. */
function BrakePedal({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="4.5" y="7" width="15" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {on && <rect x="6" y="8.5" width="12" height="7" rx="1.8" fill="currentColor" className="dp-pedal-fill" />}
    </svg>
  );
}

export function DrivingPanel() {
  const show = useStore(appStore, (s) => s.settings.showPanel);
  const units = useStore(appStore, (s) => s.settings.units);
  const frame = useStore(playStore, (s) => s.frame);
  const status = useStore(playStore, (s) => s.frameStatus);
  if (!show) return null;

  if (status === 'none' || (status === 'data' && !frame)) {
    return (
      <div className="card drive-chip" role="status" title={NO_DATA_WHY}>
        {NO_DATA}
      </div>
    );
  }

  if (status === 'loading' || !frame) {
    return (
      <div className="card drive-panel is-loading" role="status" aria-label="Reading driving data">
        <span className="progress-line" />
      </div>
    );
  }

  const speed = speedValue(frame.speedMps, units);
  const unit = unitLabel(units);
  const gear = gearLetter(frame.gear);
  const mode = autopilotLabel(frame.autopilot);
  const pedal = Math.round(frame.pedal);
  const steer = steeringText(frame.steeringDeg);
  const left = `Left turn signal ${frame.blinkLeft ? 'on' : 'off'}`;
  const right = `Right turn signal ${frame.blinkRight ? 'on' : 'off'}`;
  const brake = `Brake ${frame.brake ? 'on' : 'off'}`;

  return (
    <div className="card drive-panel" role="group" aria-label="Driving data">
      <div className="dp-main">
        <div className="dp-col">
          <span className={`dp-gear tone-${gearTone(frame.gear)}`} role="img" aria-label={`Gear ${gear}`} title={`Gear ${gear}`}>
            {gear}
          </span>
          <span className={`dp-icon dp-pedal${pedal > 0 ? ' is-on' : ''}`} role="img" aria-label={`Accelerator ${pedal}%`} title={`Accelerator ${pedal}%`}>
            <Pedal percent={pedal} />
          </span>
        </div>
        <span className={`dp-blinker${frame.blinkLeft ? ' is-on' : ''}`} role="img" aria-label={left} title={left}>
          <ArrowLeftIcon />
        </span>
        <div className="dp-speed" role="img" aria-label={`Speed ${speed} ${unit}`} title={`Speed ${speed} ${unit}`}>
          <span className="dp-speed-num tabular">{speed}</span>
          <span className="dp-unit">{unit}</span>
        </div>
        <span className={`dp-blinker${frame.blinkRight ? ' is-on' : ''}`} role="img" aria-label={right} title={right}>
          <ArrowRightIcon />
        </span>
        <div className="dp-col">
          <span className={`dp-icon dp-wheel${steeringEngaged(frame.autopilot) ? ' is-on' : ''}`} role="img" aria-label={steer} title={steer}>
            <SteeringWheelIcon style={{ transform: `rotate(${frame.steeringDeg}deg)` }} />
          </span>
          <span className={`dp-icon dp-brake${frame.brake ? ' is-on' : ''}`} role="img" aria-label={brake} title={brake}>
            <BrakePedal on={frame.brake} />
          </span>
        </div>
      </div>
      {mode && <div className="dp-mode">{mode}</div>}
    </div>
  );
}
