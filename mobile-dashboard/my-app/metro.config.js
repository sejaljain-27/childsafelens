const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('mjs', 'cjs');
config.resolver.unstable_enablePackageExports = true;

// Custom resolver to fix ESM packages that import using explicit `.js` extensions
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const moduleWithoutExt = moduleName.replace(/\.js$/, '');
    try {
      return context.resolveRequest(context, moduleWithoutExt, platform);
    } catch (e) {
      // Ignore error and fallback to default resolution
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
