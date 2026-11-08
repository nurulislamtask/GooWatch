import React from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import type { CinemaPlayerProps } from './CinemaPlayer';
import { ModernPlayer } from './ModernPlayer';
import { NativePlayerLauncher } from './NativePlayerLauncher';

/** Phone: native libVLC player. PC / web: GooWatch's own ModernPlayer. */
export const CinemaPlayer: React.FC<CinemaPlayerProps> = (props) =>
  IS_CAPACITOR ? <NativePlayerLauncher {...props} /> : <ModernPlayer {...props} />;
