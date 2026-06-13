state = loadState();
latestLocalStateStamp = Number(state?.updatedAt) || 0;
setupEventListeners();
initializeApp();
