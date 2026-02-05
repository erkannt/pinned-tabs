document.addEventListener('DOMContentLoaded', function() {
  const saveBtn = document.getElementById('saveBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const messageContainer = document.getElementById('messageContainer');
  const savedCount = document.getElementById('savedCount');
  const savedTimestamp = document.getElementById('savedTimestamp');
  const savedTabs = document.getElementById('savedTabs');

  // Show message function
  function showMessage(text, type) {
    messageContainer.innerHTML = `<div class="message ${type}">${text}</div>`;
    setTimeout(() => {
      messageContainer.innerHTML = '';
    }, 3000);
  }

  // Save pinned tabs function
  async function savePinnedTabs() {
    try {
      // Get current window's pinned tabs
      const tabs = await browser.tabs.query({
        pinned: true,
        currentWindow: true
      });

      if (tabs.length === 0) {
        showMessage('No pinned tabs found to save', 'error');
        return;
      }

      // Extract relevant tab information
      const tabData = tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        cookieStoreId: tab.cookieStoreId,
        active: tab.active,
        index: tab.index
      }));

      // Create collection object
      const collection = {
        tabs: tabData,
        timestamp: Date.now(),
        windowId: (await browser.windows.getCurrent()).id
      };

      // Save to local storage
      await browser.storage.local.set({
        savedTabs: collection
      });

      showMessage(`Saved ${tabs.length} pinned tab(s)`, 'success');
      updateDisplay();

    } catch (error) {
      console.error('Error saving tabs:', error);
      showMessage('Failed to save tabs', 'error');
    }
  }

  // Restore pinned tabs function
  async function restorePinnedTabs() {
    try {
      // Get saved collection
      const result = await browser.storage.local.get('savedTabs');
      const collection = result.savedTabs;

      if (!collection || !collection.tabs || collection.tabs.length === 0) {
        showMessage('No saved tabs found to restore', 'error');
        return;
      }

      // Get current window's pinned tabs
      const currentPinnedTabs = await browser.tabs.query({
        pinned: true,
        currentWindow: true
      });

      // Remove existing pinned tabs
      if (currentPinnedTabs.length > 0) {
        const tabIds = currentPinnedTabs.map(tab => tab.id);
        await browser.tabs.remove(tabIds);
      }

      // Create new tabs from saved data
      for (const tabData of collection.tabs) {
        try {
          await browser.tabs.create({
            url: tabData.url,
            pinned: true,
            cookieStoreId: tabData.cookieStoreId,
            active: tabData.active
          });
        } catch (createError) {
          // If container doesn't exist, create without cookieStoreId
          console.warn('Failed to create tab with container, falling back:', createError);
          await browser.tabs.create({
            url: tabData.url,
            pinned: true,
            active: tabData.active
          });
        }
      }

      showMessage(`Restored ${collection.tabs.length} pinned tab(s)`, 'success');

    } catch (error) {
      console.error('Error restoring tabs:', error);
      showMessage('Failed to restore tabs', 'error');
    }
  }

  // Update display function
  async function updateDisplay() {
    try {
      const result = await browser.storage.local.get('savedTabs');
      const collection = result.savedTabs;

      if (!collection || !collection.tabs || collection.tabs.length === 0) {
        savedCount.textContent = 'No saved collection';
        savedTimestamp.textContent = '';
        savedTabs.innerHTML = '<div class="no-saved">No tabs saved yet</div>';
        restoreBtn.disabled = true;
        return;
      }

      // Update count
      savedCount.textContent = `${collection.tabs.length} tab(s) saved`;

      // Update timestamp
      const savedDate = new Date(collection.timestamp);
      savedTimestamp.textContent = `Saved on ${savedDate.toLocaleDateString()} at ${savedDate.toLocaleTimeString()}`;

      // Update tabs list
      savedTabs.innerHTML = collection.tabs.map(tab => 
        `<a href="${tab.url}" class="saved-tab" target="_blank">${tab.title || tab.url}</a>`
      ).join('');

      // Enable restore button
      restoreBtn.disabled = false;

    } catch (error) {
      console.error('Error updating display:', error);
    }
  }

  // Event listeners
  saveBtn.addEventListener('click', savePinnedTabs);
  restoreBtn.addEventListener('click', restorePinnedTabs);

  // Initialize display
  updateDisplay();
});