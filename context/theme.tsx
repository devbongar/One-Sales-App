'use client';

import { createContext, useContext } from 'react';

type Theme = 'light' | 'dark';
export const ThemeContext = createContext<Theme>('dark');
export function useTheme() { return useContext(ThemeContext); }
