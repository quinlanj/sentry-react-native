const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stderr } = require('process');

const SENTRY_PROJECT = 'SENTRY_PROJECT';
// The org is inferred from the auth token
const SENTRY_AUTH_TOKEN = 'SENTRY_AUTH_TOKEN';

const SENTRY_CLI = 'node_modules/@sentry/cli/bin/sentry-cli';
const TMP_DIR = '.tmp';

function getEnvVar(varname) {
  return process.env[varname];
}

function getSentryPluginPropertiesFromExpoConfig() {
  try {
    const stdOutBuffer = execSync('npx expo config --json');
    const config = JSON.parse(stdOutBuffer.toString());
    const plugins = config.plugins;
    if (!plugins) {
      return null;
    }

    const sentryPlugin = plugins.find(plugin => {
      if (!Array.isArray(plugin) || plugin.length < 2) {
        return false;
      }
      const [pluginName] = plugin;
      return pluginName === '@sentry/react-native';
    });

    if (!sentryPlugin) {
      return null;
    }
    const [, pluginConfig] = sentryPlugin;
    return pluginConfig;
  } catch (error) {
    console.error('Error fetching expo config:', error);
    return null;
  }
}

function readAndPrintJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    // TODO
    throw new Error(`The file "${filePath}" does not exist. Ensure you are using eas-cli version x.x.x or higher.`);
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading or parsing JSON file:', err);
    throw err;
  }
}

function isAsset(filename) {
  return filename.endsWith('.map') || filename.endsWith('.js') || filename.endsWith('.hbc');
}

function getAssetPathsSync(directory) {
  const files = [];
  const items = fs.readdirSync(directory, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) {
      // eslint-disable-next-line no-unused-vars
      files.push(...getAssetPathsSync(fullPath));
    } else if (item.isFile() && isAsset(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function groupAssets(assetPaths) {
  const groups = {};
  for (const assetPath of assetPaths) {
    const parsedPath = path.parse(assetPath);
    const extname = parsedPath.ext;
    const assetGroupName = extname === '.map' ? path.join(parsedPath.dir, parsedPath.name) : path.format(parsedPath);
    if (!groups[assetGroupName]) {
      groups[assetGroupName] = [assetPath];
    } else {
      groups[assetGroupName].push(assetPath);
    }
  }
  return groups;
}

/**
 * Copies an array of file paths to a .tmp directory relative to the parentFilePathForTmpDir
 * @param {string} parentFilePathForTmpDir - The file path where the .tmp directory is located
 * @param {string[]} filePaths - The array of file paths to copy
 * @param {string | undefined} newFileName - The new file name to use for the copied files
 */
function copyFilesToTmpDirectory(parentFilePathForTmpDir, filePaths, newFileName) {
  const tmpDirPath = path.join(parentFilePathForTmpDir, TMP_DIR);
  // Ensure the .tmp directory exists
  if (!fs.existsSync(tmpDirPath)) {
    fs.mkdirSync(tmpDirPath, { recursive: true });
  }

  for (const filePath of filePaths) {
    const extname = path.extname(filePath); // (e.g.) .js, .hbc, .map
    const newFilePath =
      extname === '.map' ? path.join(tmpDirPath, newFileName + extname) : path.join(tmpDirPath, newFileName);
    fs.cpSync(filePath, newFilePath);
  }
}

function deleteTmpDirectory(parentFilePathForTmpDir) {
  try {
    const tmpPath = path.join(parentFilePathForTmpDir, TMP_DIR);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to delete .tmp directory:', err);
  }
}

let sentryProject = getEnvVar(SENTRY_PROJECT);
let authToken = getEnvVar(SENTRY_AUTH_TOKEN);

if (!sentryProject) {
  console.log(`Fetching ${SENTRY_PROJECT} from expo config...`);
  const pluginConfig = getSentryPluginPropertiesFromExpoConfig();
  if (!pluginConfig) {
    console.error("Could not fetch '@sentry/react-native' plugin properties from expo config.");
    process.exit(1);
  }
  sentryProject = sentryProject ? sentryProject : pluginConfig.project;
  console.log(`${SENTRY_PROJECT} resolved to ${sentryProject} from expo config.`);
}

if (!authToken) {
  console.error(`${SENTRY_AUTH_TOKEN} environment variable must be set.`);
  process.exit(1);
}

const outputDir = process.argv[2];
if (!outputDir) {
  console.error('Provide the directory with your bundles and sourcemaps as the first argument.');
  console.error('Example: node node_modules/@sentry/react-native/scripts/expo-upload-sourcemaps dist');
  process.exit(1);
}

deleteTmpDirectory(outputDir);
const files = getAssetPathsSync(outputDir);
const groupedAssets = groupAssets(files);

const easMetadataJson = readAndPrintJSONFile(path.join(outputDir, 'eas-update-metadata.json'));
const updates = easMetadataJson.updates;
const updatePlatforms = updates.map(update => update.platform);

const runtimesByAssetGroup = {};
for (const update of updates) {
  const platform = update.platform;
  const assetGroupName = Object.keys(groupedAssets).find(key => key.includes(platform));
  if (!assetGroupName) {
    console.error(`Could not find code assets for ${platform}`);
    continue;
  }
  const updateId = update.id;
  const ext = path.parse(assetGroupName).ext;
  const newAssetGroupName = `${platform}-update-id-${updateId}${ext}`;
  runtimesByAssetGroup[newAssetGroupName] = update.runtimeVersion;
  copyFilesToTmpDirectory(outputDir, groupedAssets[assetGroupName], newAssetGroupName);
}

const tmpFiles = getAssetPathsSync(path.join(outputDir, TMP_DIR));
const groupedTmpAssets = groupAssets(tmpFiles);

for (const [assetGroupName, assets] of Object.entries(groupedTmpAssets)) {
  const isHermes = assets.find(asset => asset.endsWith('.hbc'));
  const runtime = runtimesByAssetGroup[assetGroupName];
  execSync(
    `${SENTRY_CLI} sourcemaps upload --release ${runtime} ${isHermes ? '--debug-id-reference' : ''} ${assets.join(
      ' ',
    )}`,
    {
      env: {
        ...process.env,
        [SENTRY_PROJECT]: sentryProject,
      },
      stdio: 'inherit',
    },
  );
}

console.log('✅ Uploaded sourcemaps to Sentry successfully.');
