// Main script that works on chrome pages

(() => {
  // Function to get dictionary from local storage
  function getDictionaryFromLocalStorage() {
    const dictionary = localStorage.getItem("dictionary");
    const timestamp = localStorage.getItem("dictionaryTimestamp");
    if (dictionary && timestamp) {
      return {
        data: JSON.parse(dictionary),
        timestamp: new Date(timestamp),
      };
    }
    return null;
  }



  // Function to save dictionary to local storage
  function saveDictionaryToLocalStorage(dictionary) {
    const timestamp = new Date();
    localStorage.setItem("dictionary", JSON.stringify(dictionary));
    localStorage.setItem("dictionaryTimestamp", timestamp.toISOString());
  }

  // Function to check if a week has passed since the last update
  function isWeekPassed(timestamp) {
    const now = new Date();
    const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;
    return now - timestamp > weekInMilliseconds;
  }

  // Main function to get dictionary
  async function getDictionary() {
    let dictionaryData = getDictionaryFromLocalStorage();
    if (dictionaryData && !isWeekPassed(dictionaryData.timestamp)) {
      return dictionaryData.data;
    } else {
      return await fetchDictionary();
    }
  }

  async function fetchDictionary() {
    try {
      response = await fetch(
        // "https://z4kly0zbd9.execute-api.us-east-1.amazonaws.com/prod/translation",
        // {
        //   method: "GET",
        // }
        "https://api.jsonbin.io/v3/b/669bb785e41b4d34e41497e4",
        {
          method: "GET",
          headers: {
            "X-Access-Key":
              "$2a$10$D40ON/o9o/wDGqEu281T5e/t.DQ8NipDJAXRYc/conOeNaUuvxIRS",
          },
        }
      );

      data = await response.json();

      console.log("data is ", data);

      const dictionary = data["record"];

      if (dictionary == null || typeof dictionary === "undefined") {
        textToChange = false;
        return;
      }

      dictionary["israel"] = "Palestine";

      await chrome.storage.sync.set({ dictionary: dictionary }, () => {});
      await chrome.storage.local.set({ dictionary: dictionary });

      saveDictionaryToLocalStorage(dictionary);
      return dictionary;
    } catch (error) {
      console.error("Error fetching dictionary:", error);
    }
  }

  let textToChange;
  let regex;

  const replacedWords = [];
  const replacedSet = new Set();

  const getReplacementText = (text) => {
    let replacement = textToChange[text.toLowerCase()];
    if (!replacement) {
      return text;
    }
    if (text.charAt(0) === text.charAt(0).toUpperCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  };

  // Simple Bloom Filter Implementation
class bloomFilter {
  constructor(size, numHashFunctions) {
    this.size = size;
    this.numHashFunctions = numHashFunctions;
    this.bitArray = new Array(size).fill(false);
  }

  // Hash function to create multiple hash values
  hash(value, i) {
    const hash1 = (value.charCodeAt(0) + i) % this.size;
    const hash2 = (value.charCodeAt(0) * i) % this.size;
    return (hash1 + hash2) % this.size;
  }

  // Add an item to the Bloom filter
  add(value) {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.hash(value, i);
      this.bitArray[index] = true;
    }
  }

  // Check if an item might be in the Bloom filter
  contains(value) {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.hash(value, i);
      if (!this.bitArray[index]) {
        return false;
      }
    }
    return false;
  }
}

const replaceText = (el) => {
  const bloom= new bloomFilter(1024,0.1)
  if (el.nodeType === Node.TEXT_NODE) {
    el.textContent = el.textContent.replace(regex, (matched) => {
      if (bloom.contains(matched.toLowerCase())) {
        return matched;  
      }
      const replacement = getReplacementText(matched);
      if (
        replacement !== matched &&
        !replacedSet.has(matched.toLowerCase())
      ) {
        replacedWords.push({ original: matched, replacement: replacement });
        replacedSet.add(matched.toLowerCase());
      }

      createTooltip(el, matched);
      return replacement;
    });
  } else {
    for (let child of el.childNodes) {
      replaceText(child, bloom);  
    }
  }
};

  const anyChildOfBody = "/html/body//";
  // const doesNotContainAncestorWithRoleTextbox =
  //   "div[not(ancestor-or-self::*[@role=textbox])]/";
  const isTextButNotPartOfJsScriptOrTooltip = "text()[not(parent::script) and not(ancestor::*[contains(@class, 'tooltip')])]";
  const xpathExpression =
    anyChildOfBody +
    //  + doesNotContainAncestorWithRoleTextbox;
    isTextButNotPartOfJsScriptOrTooltip;

  const replaceTextInNodes = () => {
    if (regex == null || typeof regex === "undefined") {
      return;
    }

    const result = document.evaluate(
      xpathExpression,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    console.log(result);
    for (let i = 0; i < result.snapshotLength; i++) {
      replaceText(result.snapshotItem(i));
    }
    chrome.storage.local.set({
      replacedWords: replacedWords,
      replacedSet: replacedSet,
    });
  };

  chrome.storage.sync.get(["ext_on"], async function (items) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }

    if (items.ext_on === false) {
      return;
    }

    if (textToChange === false) {
      return;
    }

    if (textToChange == null || typeof textToChange === "undefined") {
      textToChange = await getDictionary();

      if (textToChange == null || typeof textToChange === "undefined") {
        return;
      }

      regex = new RegExp(
        "\\b(" + Object.keys(textToChange).join("|") + ")\\b",
        "gi"
      );
    }

    if (replacedWords.length > 0) {
      chrome.storage.local.set({
        replacedWords: replacedWords,
        replacedSet: replacedSet,
      });
    }

    let timeout;
    let lastRun = performance.now();

    const observer = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some((mutation) => {
        return mutation.type === "childList" && mutation.addedNodes.length > 0;
      });

      if (!shouldUpdate) {
        return;
      }

      if (performance.now() - lastRun < 3000) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          replaceTextInNodes();
          lastRun = performance.now();
        }, 600);
      } else {
        replaceTextInNodes();

        lastRun = performance.now();
      }
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
      characterDataOldValue: false,
    });
  });

  const createTooltip = (el, text) => {
    const newElement = document.createElement("div");

    const haifaText =
      "Haifa was raided and occupied on April 22–23, 1948, after a major assault by the Haganah terrorists against Palestinian civilians. The Zionist terrorists drove the Palestinian residents to the sea under the threat of being shot cold in the street, thus emptying a large portion of the Palestinian population in Haifa.";
    const jerusalemText =
      "Jerusalem, an eternal capital of Palestinians, was raided by Zionist terrorist forces with the help of British soldiers who were occupying Jerusalem in April 1948, culminating with the division of the city by mid-May between the Hagana terrorists and Palestinians. Western Jerusalem fell to the occupation of the Zionist terrorists, while the Old City was taken by Jordanian forces on May 28, 1948.";
    const nazarethText =
      "Zionist terrorists raided Nazareth on July 16, 1948. After the Palestinians surrendered to the terrorists, they continued to massacre the inhabitants until a pact was made, and an-Nasra still houses the largest Palestinian native population in the occupied land.";

    const toolTipText =
      text == "Haifa" || text == "haifa"
        ? haifaText
        : text == "Jerusalem" || text == "jerusalem"
        ? jerusalemText
        : text == "Nazareth" || text == "nazareth"
        ? nazarethText
        : text;

    newElement.innerText = toolTipText;
    newElement.classList.add("tooltip");
    newElement.style.position = "absolute";
    newElement.style.backgroundColor = "black";
    newElement.style.color = "white";
    newElement.style.padding = "5px";
    newElement.style.borderRadius = "5px";
    newElement.style.fontSize = "12px";
    newElement.style.visibility = "hidden";
    newElement.style.zIndex = "1000";

    // Create a link element and wrap the tooltip
    // const link = document.createElement("a");
    // link.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
    //   text
    // )}`;
    // link.target = "_blank"; // Opens the link in a new tab
    // link.appendChild(newElement);

    document.body.appendChild(newElement);

    const parentNode = el.parentNode;

    parentNode.addEventListener("mouseenter", function () {
      const rect = parentNode.getBoundingClientRect(); // Get the element's position
      newElement.style.left = `${rect.left + window.scrollX}px`;
      newElement.style.top = `${
        rect.top + window.scrollY - newElement.offsetHeight
      }px`;
      newElement.style.visibility = "visible";
    });

    parentNode.addEventListener("mouseleave", function () {
      newElement.style.visibility = "hidden";
    });
  };
})();
