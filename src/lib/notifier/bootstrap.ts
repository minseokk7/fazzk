export const LOCAL_APP_HOST = '127.0.0.1';

export function detectOBSMode(options: {
  isTauri: boolean;
  pathname: string;
  hash: string;
  obsMode?: boolean;
  directNotifierMode?: boolean;
}): boolean {
  const { isTauri, pathname, hash, obsMode, directNotifierMode } = options;

  return !!(
    obsMode ||
    directNotifierMode ||
    (!isTauri &&
      (pathname === '/follower' ||
        pathname.endsWith('/follower') ||
        hash === '#/notifier' ||
        hash === '#/follower'))
  );
}

export function resolveRedirectorPath(appDir?: string | null): string | null {
  if (!appDir) {
    return null;
  }

  return `file:///${appDir}/scripts/obs-redirector.html`.replace(/\\/g, '/');
}

export function resolveServerUrls(options: {
  isTauri: boolean;
  isOBSMode: boolean;
  origin: string;
  port?: number;
}): { baseUrl: string; obsUrl: string } {
  const { isTauri, isOBSMode, origin, port } = options;

  if (!isTauri || isOBSMode || port === undefined) {
    return {
      baseUrl: origin,
      obsUrl: `${origin}/follower`,
    };
  }

  const baseUrl = `http://${LOCAL_APP_HOST}:${port}`;
  return {
    baseUrl,
    obsUrl: `${baseUrl}/follower`,
  };
}
