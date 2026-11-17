/* global module */
(function exposePlatformDetection(root) {
  'use strict';

  function detectPlatform(navigatorRef = root.navigator || {}) {
    const hintedPlatform = navigatorRef.userAgentData?.platform || '';
    const platform = `${hintedPlatform} ${navigatorRef.userAgent || ''}`.toLowerCase();
    if (/windows|win32|win64/.test(platform)) return 'windows';
    if (/macos|macintosh|mac os x|macintel|macppc|mac68k/.test(platform)) return 'macos';
    return 'other';
  }

  function fromUserAgent(userAgent = '') {
    const normalized = String(userAgent).toLowerCase();
    // WOW64 identifies a 32-bit browser running on a 64-bit Windows system.
    if (/wow64|win64|x64|amd64|x86_64|arm64/.test(normalized)) return '64';
    if (/win32|(?:^|[;\s])x86(?:[;\s]|$)|i[3-6]86/.test(normalized)) return '32';
    return 'unknown';
  }

  function bitnessFromHints(hints) {
    const bitness = String(hints?.bitness || '');
    if (bitness === '32' || bitness === '64') return bitness;

    const architecture = String(hints?.architecture || '').toLowerCase();
    if (/^(x86|ia32|i386|i686)$/.test(architecture)) return '32';
    if (/^(x64|x86_64|amd64|arm64)$/.test(architecture)) return '64';
    return 'unknown';
  }

  async function detectWindowsBitness(navigatorRef = root.navigator || {}) {
    const fallback = () => fromUserAgent(navigatorRef.userAgent || '');
    const getHints = navigatorRef.userAgentData?.getHighEntropyValues;
    if (typeof getHints !== 'function') return fallback();

    try {
      const hints = await getHints.call(navigatorRef.userAgentData, ['architecture', 'bitness']);
      const bitness = bitnessFromHints(hints);
      return bitness === 'unknown' ? fallback() : bitness;
    } catch {
      return fallback();
    }
  }

  async function detectMacChip(navigatorRef = root.navigator || {}) {
    const userAgentData = navigatorRef.userAgentData;
    if (typeof userAgentData?.getHighEntropyValues !== 'function') return 'unknown';

    try {
      const hints = await userAgentData.getHighEntropyValues(['architecture']);
      const architecture = String(hints?.architecture || '').toLowerCase();
      if (/^(arm|arm64|aarch64)$/.test(architecture)) return 'apple-silicon';
      if (/^(x86|x64|x86_64|amd64|ia32)$/.test(architecture)) return 'intel';
    } catch {
      // Safari and browsers that restrict high-entropy hints use the universal download.
    }
    return 'unknown';
  }

  function resolveDownloadTarget(platform, windowsBitness = 'unknown', macChip = 'unknown') {
    if (platform === 'windows' && windowsBitness === '64') {
      return {
        download: 'windows',
        available: true,
        label: 'Baixar para Windows 64-bit',
        message: 'Windows 64-bit detectado. O instalador x64 é compatível com este sistema.',
      };
    }

    if (platform === 'windows' && windowsBitness === '32') {
      return {
        download: null,
        available: false,
        label: 'Windows 32-bit indisponível',
        message:
          'O FaderDeck ainda não oferece instalador para Windows 32-bit. O instalador atual exige Windows 64-bit.',
      };
    }

    if (platform === 'windows') {
      return {
        download: 'downloads',
        available: true,
        label: 'Ver opção Windows 64-bit',
        message:
          'Não foi possível confirmar a arquitetura do Windows. O instalador disponível é somente para 64-bit (x64).',
      };
    }

    if (platform === 'macos') {
      const chipLabel =
        macChip === 'intel' ? 'Intel' : macChip === 'apple-silicon' ? 'Apple Silicon' : null;
      return {
        download: 'macos',
        available: true,
        label: chipLabel
          ? `Baixar para Mac ${chipLabel} (Universal)`
          : 'Baixar para macOS (Universal)',
        message: chipLabel
          ? `Mac ${chipLabel} detectado. O instalador universal também funciona na outra arquitetura.`
          : 'O instalador universal funciona em Macs Intel e Apple Silicon.',
      };
    }

    return {
      download: 'downloads',
      available: true,
      label: 'Baixar Aplicativo',
      message: 'Escolha o instalador compatível com seu sistema na seção de downloads.',
    };
  }

  const api = Object.freeze({
    detectPlatform,
    detectWindowsBitness,
    detectMacChip,
    resolveDownloadTarget,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FaderDeckPlatformDetection = api;
  }
})(typeof globalThis === 'object' ? globalThis : this);
