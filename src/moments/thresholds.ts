// Tuned on the sample clips (2026-10-22). The g-force lines are the ones Tesla's Safety Score uses:
// hard braking above 0.3 g, aggressive turning above 0.4 g.
const G = 9.81;

/** Braking (positive linear_acceleration_mps2_y) at or above 0.3 g… */
export const HARD_BRAKE_MPS2 = 0.3 * G;
/** …held this long, so a jolt doesn't count… */
export const HARD_BRAKE_MIN_S = 0.5;
/** …starting at or above 15 km/h, so the last moment of a normal stop doesn't count. */
export const HARD_BRAKE_MIN_SPEED_MPS = 15 / 3.6;

/** Sideways force (|linear_acceleration_mps2_x|) at or above 0.4 g, held this long, above 30 km/h. */
export const SWERVE_LATERAL_MPS2 = 0.4 * G;
export const SWERVE_MIN_S = 0.3;
export const SWERVE_MIN_SPEED_MPS = 30 / 3.6;
/** Or the wheel turning this fast (over the window)… */
export const STEER_RATE_DEG_S = 180;
export const STEER_RATE_WINDOW_S = 0.1;
/** …when the car then moves sideways at 0.2 g or more within this time (a quick correction doesn't). */
export const STEER_SWERVE_LATERAL_MPS2 = 0.2 * G;
export const STEER_SWERVE_LOOKAHEAD_S = 1;

export const MERGE_GAP_S = 3;
export const MOVING_MPS = 1;
/** Jumps land this many seconds before a moment. */
export const JUMP_LEAD_S = 3;
