'use strict';

const { FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  // Electron Builder calls afterPack for both intermediate universal slices and
  // again after merging; signing the slices would break the merge.
  if (
    context.electronPlatformName === 'darwin' &&
    /-universal-(x64|arm64)-temp$/.test(context.appOutDir)
  ) {
    return;
  }
  await context.packager.addElectronFuses(context, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });
};
