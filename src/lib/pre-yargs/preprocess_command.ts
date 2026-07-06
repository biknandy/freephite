import { handleDeprecatedCommandNames } from './deprecated_commands';
import { passthrough } from './passthrough';

/**
 * Modern (flat) commands and their aliases are resolved directly by yargs;
 * this table only expands the legacy noun-verb shortcut combos and the
 * shortcuts that carry flags (e.g. `ss` -> `submit --stack`).
 */
const SHORTCUT_EXPANSIONS: Record<string, string[]> = {
  // legacy `branch` shortcuts
  bb: ['branch', 'bottom'],
  bc: ['branch', 'create'],
  bco: ['branch', 'checkout'],
  bd: ['branch', 'down'],
  bdl: ['branch', 'delete'],
  be: ['branch', 'edit'],
  bf: ['branch', 'fold'],
  bi: ['branch', 'info'],
  bn: ['branch', 'next'],
  bp: ['branch', 'previous'],
  br: ['branch', 'restack'],
  brn: ['branch', 'rename'],
  bs: ['branch', 'submit'],
  bsp: ['branch', 'split'],
  bsq: ['branch', 'squash'],
  bt: ['branch', 'top'],
  btr: ['branch', 'track'],
  bu: ['branch', 'up'],
  bub: ['branch', 'unbranch'],
  but: ['branch', 'untrack'],
  // legacy `commit` shortcuts
  ca: ['commit', 'amend'],
  cc: ['commit', 'create'],
  // legacy `dash` shortcuts
  dd: ['dash'],
  dp: ['dash', 'pr'],
  dpr: ['dash', 'pr'],
  // legacy `downstack` shortcuts
  dse: ['downstack', 'edit'],
  dsg: ['downstack', 'get'],
  dsr: ['downstack', 'restack'],
  dss: ['downstack', 'submit'],
  dst: ['downstack', 'test'],
  dstr: ['downstack', 'track'],
  // `log` shortcuts
  ll: ['log', 'long'],
  ls: ['log', 'short'],
  // legacy `repo` shortcuts
  ri: ['repo', 'init'],
  rs: ['repo', 'sync'],
  rt: ['repo', 'trunk'],
  // legacy `stack` shortcuts
  sf: ['stack', 'restack'],
  sr: ['stack', 'restack'],
  st: ['stack', 'test'],
  // legacy `upstack` shortcuts
  usf: ['upstack', 'restack'],
  uso: ['upstack', 'onto'],
  usr: ['upstack', 'restack'],
  uss: ['upstack', 'submit'],
  ust: ['upstack', 'test'],
  // modern shortcuts
  ss: ['submit', '--stack'],
};

function splitShortcuts(command: string): string[] {
  return SHORTCUT_EXPANSIONS[command] ?? [command];
}

export function getYargsInput(): string[] {
  passthrough(process.argv);
  if (process.argv.length < 3) {
    return [];
  }
  const yargsInput = [
    ...splitShortcuts(process.argv[2]),
    ...process.argv.slice(3),
  ];
  handleDeprecatedCommandNames(yargsInput.slice(0, 2));
  return yargsInput;
}
