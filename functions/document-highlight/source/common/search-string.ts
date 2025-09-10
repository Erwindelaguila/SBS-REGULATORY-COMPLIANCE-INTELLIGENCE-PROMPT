interface SearchResult {
  startIndex: number;
  endIndex: number;
}

export function findOriginalIndexes(text: string, search: string): SearchResult {
  // Remove all whitespace from the search pattern
  const spacelessSearch = search.replace(/\s+/g, "");

  // Initialize tracking variables
  let startIndex = -1; // Will store where match begins
  let endIndex = -1; // Will store where match ends
  let currentMatch = 0; // Tracks how many characters have matched so far

  // Iterate through each character in the text
  for (let i = 0; i < text.length; i++) {
    // If current character is not whitespace
    if (!text[i].match(/\s/)) {
      // If current character matches what we're looking for
      if (text[i] === spacelessSearch[currentMatch]) {
        // If this is the first matching character, record start position
        if (currentMatch === 0) startIndex = i;

        // Increment our match counter
        currentMatch++;

        // If we've matched all characters in our search string
        if (currentMatch === spacelessSearch.length) {
          // Set end index to position after current character
          endIndex = i + 1;
          // Return the match positions
          return { startIndex, endIndex };
        }
      } else {
        // If character doesn't match, reset match counter
        currentMatch = 0;

        // Check if current character could start a new match
        if (text[i] === spacelessSearch[0]) {
          startIndex = i;
          currentMatch = 1;
        }
      }
    }
    // If we encounter whitespace while in the middle of a match
    else if (currentMatch > 0) {
      // Include the whitespace in our matching range
      endIndex = i;
    }
  }

  // Return the final result (will be -1, -1 if no match found)
  return {
    startIndex,
    endIndex,
  };
}
