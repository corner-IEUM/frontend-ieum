// Icon.tsx — line-glyph icon set using react-native-svg (ports the web set)
import React from 'react';
import Svg, { Path, Circle, Rect, G, Line } from 'react-native-svg';

export type IconName =
  | 'walk' | 'bus' | 'subway' | 'compass' | 'tune' | 'speaker' | 'vibrate'
  | 'traffic' | 'pin' | 'mic' | 'alert' | 'door' | 'stairs' | 'gap'
  | 'chevron' | 'chevronL' | 'arrowUp' | 'arrowR' | 'check' | 'x' | 'plus'
  | 'bike' | 'person' | 'home' | 'eye' | 'refresh' | 'cross' | 'bell'
  | 'camera' | 'logout' | 'mail' | 'lock' | 'clock';

interface Props { name: IconName; size?: number; color?: string; sw?: number; }

export function Icon({ name, size = 28, color = '#fff', sw = 2 }: Props) {
  const s: any = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const fillC: any = { fill: color };
  const body = (() => {
    switch (name) {
      case 'walk': return <G><Circle cx={13.5} cy={4.2} r={2.1} {...fillC} /><Path {...s} d="M13 8l-3 4 1 5m2-9l3 2 3 1m-6-3l-1 5-3 5m4-5l2 4" /></G>;
      case 'bus': return <G><Rect x={4} y={3.5} width={16} height={15} rx={3} {...s} /><Path {...s} d="M4 13h16M8 18.5v2M16 18.5v2" /><Circle cx={8.5} cy={15.5} r={1} {...fillC} /><Circle cx={15.5} cy={15.5} r={1} {...fillC} /></G>;
      case 'subway': return <G><Rect x={5} y={3} width={14} height={13} rx={3} {...s} /><Path {...s} d="M5 11h14M8 20l2-3m6 3l-2-3" /><Circle cx={9} cy={13.5} r={1} {...fillC} /><Circle cx={15} cy={13.5} r={1} {...fillC} /></G>;
      case 'compass': return <G><Circle cx={12} cy={12} r={9} {...s} /><Path {...fillC} d="M15.5 8.5l-2 5-5 2 2-5z" /></G>;
      case 'tune': return <G><Path {...s} d="M5 7h7m4 0h3M5 17h3m4 0h7" /><Circle cx={14} cy={7} r={2.2} {...s} /><Circle cx={10} cy={17} r={2.2} {...s} /></G>;
      case 'speaker': return <G><Path {...s} d="M4 9v6h3l5 4V5L7 9H4z" /><Path {...s} d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2.2 2 2.2 8 0 10" /></G>;
      case 'vibrate': return <G><Rect x={8} y={5} width={8} height={14} rx={2} {...s} /><Path {...s} d="M3.5 9v6M5.5 11v2M20.5 9v6M18.5 11v2" /></G>;
      case 'traffic': return <G><Rect x={7.5} y={2.5} width={9} height={17} rx={3.5} {...s} /><Path {...s} d="M10 21h4" /><Circle cx={12} cy={7} r={1.4} {...fillC} /><Circle cx={12} cy={12} r={1.4} {...fillC} /><Circle cx={12} cy={17} r={1.4} {...fillC} /></G>;
      case 'pin': return <G><Path {...s} d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><Circle cx={12} cy={10} r={2.5} {...s} /></G>;
      case 'mic': return <G><Rect x={9} y={2.5} width={6} height={11} rx={3} {...s} /><Path {...s} d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6" /></G>;
      case 'alert': return <G><Path {...s} d="M12 3L1.5 21h21L12 3z" /><Path {...s} d="M12 9v5" /><Circle cx={12} cy={17.5} r={0.7} {...fillC} /></G>;
      case 'door': return <G><Rect x={6} y={3} width={12} height={18} rx={1.5} {...s} /><Path {...s} d="M6 21h12" /><Circle cx={14.5} cy={12} r={1} {...fillC} /></G>;
      case 'stairs': return <G><Path {...s} d="M3 19h4v-4h4v-4h4V7h5" /></G>;
      case 'gap': return <G><Path {...s} d="M9 4v16M15 4v16M11 12h2" /></G>;
      case 'chevron': return <Path {...s} d="M9 5l7 7-7 7" />;
      case 'chevronL': return <Path {...s} d="M15 5l-7 7 7 7" />;
      case 'arrowUp': return <Path {...s} d="M12 20V5M6 11l6-6 6 6" />;
      case 'arrowR': return <Path {...s} d="M5 12h14M13 6l6 6-6 6" />;
      case 'check': return <Path {...s} d="M4 12.5l5 5 11-11" />;
      case 'x': return <Path {...s} d="M6 6l12 12M18 6L6 18" />;
      case 'plus': return <Path {...s} d="M12 5v14M5 12h14" />;
      case 'bike': return <G><Circle cx={6} cy={16.5} r={3.5} {...s} /><Circle cx={18} cy={16.5} r={3.5} {...s} /><Path {...s} d="M6 16.5l4-7h5l-3 7M9 6h3l1 3.5M13.5 9.5L16 6" /></G>;
      case 'person': return <G><Circle cx={12} cy={6} r={3} {...s} /><Path {...s} d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /></G>;
      case 'home': return <Path {...s} d="M4 11l8-7 8 7M6 9.5V20h12V9.5" />;
      case 'eye': return <G><Path {...s} d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><Circle cx={12} cy={12} r={3} {...s} /></G>;
      case 'refresh': return <G><Path {...s} d="M4 5v5h5M20 19v-5h-5" /><Path {...s} d="M19 9a8 8 0 00-14-2L4 10M5 15a8 8 0 0014 2l1-3" /></G>;
      case 'cross': return <Path {...s} d="M5 9h14M5 15h14M9 5v14M15 5v14" />;
      case 'bell': return <G><Path {...s} d="M6 9a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 004 0" /></G>;
      case 'camera': return <G><Path {...s} d="M4 8.5a1.5 1.5 0 011.5-1.5h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z" /><Circle cx={12} cy={13} r={3.4} {...s} /></G>;
      case 'logout': return <G><Path {...s} d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M15 16l4-4-4-4M19 12H9" /></G>;
      case 'mail': return <G><Rect x={4} y={6} width={16} height={12} {...s} /><Path {...s} d="M4 7l8 6 8-6" /></G>;
      case 'lock': return <G><Rect x={6} y={10.5} width={12} height={9} rx={2} {...s} /><Path {...s} d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></G>;
      case 'clock': return <G><Circle cx={12} cy={12} r={9} {...s} /><Path {...s} d="M12 7v5l3.5 2" /></G>;
      default: return null;
    }
  })();
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
