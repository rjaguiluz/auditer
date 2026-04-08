// ============================================================================
// GLOBAL STATE
// ============================================================================

const STATE = {
  SILENT_MODE: false,
  ASSUME_YES: false,
  DRY_RUN: false,
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

function setAssumeYes(value) {
  STATE.ASSUME_YES = value;
}

function getAssumeYes() {
  return STATE.ASSUME_YES;
}

function setDryRun(value) {
  STATE.DRY_RUN = value;
}

function getDryRun() {
  return STATE.DRY_RUN;
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
  setAssumeYes,
  getAssumeYes,
  setDryRun,
  getDryRun,
  getChangesTracker,
  resetChangesTracker
};
