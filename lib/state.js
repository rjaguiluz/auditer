// ============================================================================
// GLOBAL STATE
// ============================================================================

const STATE = {
  SILENT_MODE: false,
  CHANGES_TRACKER: {
    directUpdates: [],
    overrides: [],
    removed: [],
    versionChanges: []
  }
};

function setSilentMode(value) {
  STATE.SILENT_MODE = value;
}

function getSilentMode() {
  return STATE.SILENT_MODE;
}

function getChangesTracker() {
  return STATE.CHANGES_TRACKER;
}

function resetChangesTracker() {
  STATE.CHANGES_TRACKER = {
    directUpdates: [],
    overrides: [],
    removed: [],
    versionChanges: []
  };
}

module.exports = {
  setSilentMode,
  getSilentMode,
  getChangesTracker,
  resetChangesTracker
};
