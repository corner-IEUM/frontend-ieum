// theme-context.tsx — provides active Theme + ambient status setter
import React, { createContext, useContext } from 'react';
import { Theme, THEMES, Level } from './theme';

export const ThemeCtx = createContext<Theme>(THEMES.light);
export const useTheme = () => useContext(ThemeCtx);

type Ambient = (l: Level | 'idle') => void;
export const AmbientCtx = createContext<Ambient>(() => {});
export const useAmbient = () => useContext(AmbientCtx);
