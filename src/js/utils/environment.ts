import { Platform } from 'react-native';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { ReactNativeLibraries } from './rnlibraries';

/** Checks if the React Native Hermes engine is running */
export function isHermesEnabled(): boolean {
  return !!RN_GLOBAL_OBJ.HermesInternal;
}

/** Checks if the React Native TurboModules are enabled */
export function isTurboModuleEnabled(): boolean {
  return RN_GLOBAL_OBJ.__turboModuleProxy != null;
}

/** Checks if the React Native Fabric renderer is running */
export function isFabricEnabled(): boolean {
  return RN_GLOBAL_OBJ.nativeFabricUIManager != null;
}

/** Returns React Native Version as semver string */
export function getReactNativeVersion(): string | undefined {
  if (!ReactNativeLibraries.ReactNativeVersion) {
    return undefined;
  }
  const RNV = ReactNativeLibraries.ReactNativeVersion.version;
  return `${RNV.major}.${RNV.minor}.${RNV.patch}${RNV.prerelease != null ? `-${RNV.prerelease}` : ''}`;
}

/** Checks if Expo is present in the runtime */
export function isExpo(): boolean {
  return RN_GLOBAL_OBJ.expo != null;
}

/** Check if JS runs in Expo Go */
export function isExpoGo(): boolean {
  return (
    (RN_GLOBAL_OBJ.expo &&
      RN_GLOBAL_OBJ.expo.modules &&
      RN_GLOBAL_OBJ.expo.modules.ExponentConstants &&
      RN_GLOBAL_OBJ.expo.modules.ExponentConstants.appOwnership === 'expo') ||
    false
  );
}

/** Checks if the current platform is not web */
export function notWeb(): boolean {
  return Platform.OS !== 'web';
}

/** Returns Hermes Version if hermes is present in the runtime */
export function getHermesVersion(): string | undefined {
  return (
    RN_GLOBAL_OBJ.HermesInternal &&
    RN_GLOBAL_OBJ.HermesInternal.getRuntimeProperties &&
    RN_GLOBAL_OBJ.HermesInternal.getRuntimeProperties()['OSS Release Version']
  );
}

/** Returns default environment based on __DEV__ */
export function getDefaultEnvironment(): 'development' | 'production' {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}
