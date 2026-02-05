document.addEventListener("DOMContentLoaded", function () {
  const saveBtn = document.getElementById("saveBtn");
  const restoreBtn = document.getElementById("restoreBtn");
  const messageContainer = document.getElementById("messageContainer");
  const savedTabs = document.getElementById("savedTabs");

  // Show message function
  function showMessage(text, type) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    messageContainer.innerHTML = "";
    messageContainer.appendChild(messageDiv);
    setTimeout(() => {
      messageContainer.innerHTML = "";
    }, 3000);
  }

  // Get container information for a given cookieStoreId
  async function getContainerInfo(cookieStoreId) {
    // Handle default container (no container)
    if (!cookieStoreId || cookieStoreId === "firefox-default") {
      return {
        name: "Default",
        color: null,
        icon: null,
        iconUrl: null,
        isDefault: true,
      };
    }

    try {
      const container = await browser.contextualIdentities.get(cookieStoreId);
      if (container) {
        return {
          name: container.name,
          color: container.color,
          icon: container.icon,
          iconUrl: container.iconUrl,
          isDefault: false,
        };
      }
    } catch (error) {
      console.warn("Container not found:", cookieStoreId);
    }

    // Container not found or doesn't exist
    return null;
  }

  // Get all container information for tabs
  async function getContainerInfoForTabs(tabs) {
    const containerPromises = tabs.map(async (tab) => {
      const containerInfo = await getContainerInfo(tab.cookieStoreId);
      return {
        ...tab,
        containerInfo: containerInfo,
      };
    });

    return Promise.all(containerPromises);
  }

  // Recreate a deleted container
  async function recreateContainer(containerInfo) {
    if (!containerInfo || containerInfo.isDefault) {
      return null;
    }

    try {
      const newContainer = await browser.contextualIdentities.create({
        name: containerInfo.name,
        color: containerInfo.color,
        icon: containerInfo.icon,
      });
      return newContainer.cookieStoreId;
    } catch (error) {
      console.warn("Failed to recreate container:", error);
      return null;
    }
  }

  // Get container color CSS
  function getContainerColor(color) {
    const colorMap = {
      blue: "#0060df",
      turquoise: "#00b1b4",
      green: "#12bc00",
      yellow: "#ffe900",
      orange: "#ff9400",
      red: "#e31587",
      pink: "#ff4bda",
      purple: "#9400ff",
      toolbar: "#7c7c7d",
    };
    return colorMap[color] || "#7c7c7d";
  }

  // Get container icon URL
  function getContainerIcon(icon) {
    if (!icon) return null;
    return `resource://usercontext-content/${icon}.svg`;
  }

  // Check if cookies permission is available
  async function checkCookiesPermission() {
    try {
      // Try to access cookies API to check permission
      await browser.cookies.getAll({});
      return true;
    } catch (error) {
      console.warn("Cookies permission not available:", error);
      return false;
    }
  }

  // Save pinned tabs function
  async function savePinnedTabs() {
    try {
      // Check if cookies permission is available (needed for container support)
      const hasCookiesPermission = await checkCookiesPermission();
      if (!hasCookiesPermission) {
        showMessage(
          "Warning: cookies permission not granted. Container support may be limited.",
          "error",
        );
      }

      // Get current window's pinned tabs
      const tabs = await browser.tabs.query({
        pinned: true,
        currentWindow: true,
      });

      if (tabs.length === 0) {
        showMessage("No pinned tabs found to save", "error");
        return;
      }

      // Get container information for all tabs
      const tabsWithContainers = await getContainerInfoForTabs(tabs);

      // Extract relevant tab information with container data
      const tabData = tabsWithContainers.map((tab) => ({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        cookieStoreId: tab.cookieStoreId,
        containerInfo: tab.containerInfo,
        active: tab.active,
        index: tab.index,
      }));

      // Create collection object
      const collection = {
        tabs: tabData,
        timestamp: Date.now(),
      };

      // Save to local storage
      await browser.storage.local.set({
        savedTabs: collection,
      });

      showMessage(
        `Saved ${tabs.length} pinned tab(s) with container information`,
        "success",
      );
      updateDisplay();
    } catch (error) {
      console.error("Error saving tabs:", error);
      showMessage("Failed to save tabs", "error");
    }
  }

  // Restore pinned tabs function
  async function restorePinnedTabs() {
    try {
      // Check if cookies permission is available (needed for container support)
      const hasCookiesPermission = await checkCookiesPermission();
      if (!hasCookiesPermission) {
        showMessage(
          "Warning: cookies permission not granted. Container restoration may fail.",
          "error",
        );
      }

      // Get saved collection
      const result = await browser.storage.local.get("savedTabs");
      const collection = result.savedTabs;

      if (!collection || !collection.tabs || collection.tabs.length === 0) {
        showMessage("No saved tabs found to restore", "error");
        return;
      }

      // Get current window's pinned tabs
      const currentPinnedTabs = await browser.tabs.query({
        pinned: true,
        currentWindow: true,
      });

      // Remove existing pinned tabs
      if (currentPinnedTabs.length > 0) {
        const tabIds = currentPinnedTabs.map((tab) => tab.id);
        await browser.tabs.remove(tabIds);
      }

      let restoredCount = 0;
      let missingContainers = [];

      // Create new tabs from saved data
      for (const tabData of collection.tabs) {
        try {
          let cookieStoreId = tabData.cookieStoreId;

          // Check if container still exists
          if (cookieStoreId && cookieStoreId !== "firefox-default") {
            const currentContainer = await getContainerInfo(cookieStoreId);
            if (!currentContainer) {
              // Container doesn't exist, try to recreate it
              missingContainers.push(tabData.containerInfo?.name || "Unknown");
              const newCookieStoreId = await recreateContainer(
                tabData.containerInfo,
              );
              if (newCookieStoreId) {
                cookieStoreId = newCookieStoreId;
              } else {
                cookieStoreId = null; // Fall back to default
              }
            }
          }

          await browser.tabs.create({
            url: tabData.url,
            pinned: true,
            cookieStoreId: cookieStoreId,
            active: tabData.active,
          });
          restoredCount++;
        } catch (createError) {
          console.warn("Failed to create tab:", createError);

          // Handle specific error cases
          if (
            createError.message &&
            createError.message.includes("No permission")
          ) {
            // Permission error - likely missing cookies permission (should be fixed now)
            console.error(
              "Permission error creating tab - cookies permission may not be granted",
            );
          } else if (
            createError.message &&
            createError.message.includes("private")
          ) {
            // Private container error
            console.warn(
              "Cannot create private container tab in non-private window",
            );
          } else if (
            createError.message &&
            createError.message.includes("Illegal")
          ) {
            // Illegal cookieStoreId error
            console.warn(
              "Illegal cookieStoreId - container may not exist or be accessible",
            );
          }

          // Try fallback: create tab without container
          try {
            await browser.tabs.create({
              url: tabData.url,
              pinned: true,
              active: tabData.active,
            });
            restoredCount++;
          } catch (fallbackError) {
            console.warn("Fallback tab creation also failed:", fallbackError);
          }
        }
      }

      let message = `Restored ${restoredCount} of ${collection.tabs.length} pinned tab(s)`;
      if (missingContainers.length > 0) {
        message += `. Some containers were missing: ${missingContainers.join(", ")}`;
      }
      showMessage(
        message,
        restoredCount === collection.tabs.length ? "success" : "error",
      );
    } catch (error) {
      console.error("Error restoring tabs:", error);
      showMessage("Failed to restore tabs", "error");
    }
  }

  // Update display function
  async function updateDisplay() {
    try {
      const result = await browser.storage.local.get("savedTabs");
      const collection = result.savedTabs;

      if (!collection || !collection.tabs || collection.tabs.length === 0) {
        savedTabs.innerHTML = "";
        const noSavedDiv = document.createElement("div");
        noSavedDiv.className = "no-saved";
        noSavedDiv.textContent = "No tabs saved yet";
        savedTabs.appendChild(noSavedDiv);
        restoreBtn.disabled = true;
        return;
      }

      // Update tabs list with container information
      savedTabs.innerHTML = "";
      for (const tab of collection.tabs) {
        const containerInfo = tab.containerInfo;
        const itemDiv = document.createElement("div");
        itemDiv.className = "saved-tab-item";

        const link = document.createElement("a");
        link.href = tab.url;
        link.className = "saved-tab";
        link.target = "_blank";
        link.textContent = tab.title || tab.url;
        if (containerInfo && !containerInfo.isDefault) {
          const containerColor = getContainerColor(containerInfo.color);
          const containerIcon = getContainerIcon(containerInfo.icon);

          const badgeDiv = document.createElement("span");
          badgeDiv.className = "container-badge";
          badgeDiv.style.backgroundColor = containerColor;

          if (containerIcon) {
            const iconImg = document.createElement("img");
            iconImg.src = containerIcon;
            iconImg.className = "container-icon";
            iconImg.alt = "";
            badgeDiv.appendChild(iconImg);
          }

          const nameSpan = document.createElement("span");
          nameSpan.className = "container-name";
          nameSpan.textContent = containerInfo.name;
          badgeDiv.appendChild(nameSpan);

          itemDiv.appendChild(badgeDiv);
        }
        itemDiv.appendChild(link);

        savedTabs.appendChild(itemDiv);
      }

      // Enable restore button
      restoreBtn.disabled = false;
    } catch (error) {
      console.error("Error updating display:", error);
    }
  }

  // Event listeners
  saveBtn.addEventListener("click", savePinnedTabs);
  restoreBtn.addEventListener("click", restorePinnedTabs);

  // Initialize display
  updateDisplay();
});
