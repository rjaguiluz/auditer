'use strict';

const fs = require('fs');
const path = require('path');
const { findWorkspaces } = require('../lib/workspace');

jest.mock('fs');

describe('workspace.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns only directories containing package.json while ignoring node_modules', () => {
    fs.readdirSync.mockImplementation((dir) => {
      // Root space
      if (dir === 'root') return ['package.json', 'node_modules', 'packages', 'index.js'];
      if (dir === path.join('root', 'node_modules')) return ['package.json']; // Should be ignored
      if (dir === path.join('root', 'packages')) return ['api', 'ui', 'utils'];
      if (dir === path.join('root', 'packages', 'api')) return ['package.json', 'server.js'];
      if (dir === path.join('root', 'packages', 'ui')) return ['package.json', 'frontend.js'];
      if (dir === path.join('root', 'packages', 'utils')) return ['helper.js']; // No package.json
      return [];
    });

    fs.statSync.mockImplementation((targetPath) => {
      const isDir = !targetPath.endsWith('.js') && !targetPath.endsWith('.json');
      return { isDirectory: () => isDir };
    });

    const workspaces = findWorkspaces('root');

    expect(workspaces).toContain('root');
    expect(workspaces).toContain(path.join('root', 'packages', 'api'));
    expect(workspaces).toContain(path.join('root', 'packages', 'ui'));
    expect(workspaces).not.toContain(path.join('root', 'node_modules'));
    expect(workspaces).not.toContain(path.join('root', 'packages', 'utils'));
  });

  test('safely handles read permission errors', () => {
    fs.readdirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const workspaces = findWorkspaces('/protected-dir');
    expect(workspaces).toEqual([]);
  });

  test('safely ignores broken symlink stat errors', () => {
    fs.readdirSync.mockImplementation((dir) => {
      if (dir === 'root') return ['broken-link'];
      return [];
    });

    fs.statSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const workspaces = findWorkspaces('root');
    expect(workspaces).toEqual([]);
  });
});
