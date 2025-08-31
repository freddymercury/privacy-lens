# Memory Issue Fix Strategy

## Problem Summary
The backend crashes with "JavaScript heap out of memory" when processing large privacy policies with 110+ assets during diff generation in `backend/src/services/archiver/versioner.js:300`.

## Root Cause Analysis
1. **Memory consumption**: `diff.diffWords()` loads both full texts into memory
2. **Algorithm overhead**: Word-based diffing creates data structures 3-4x input size
3. **Large inputs**: Concatenated text from 110+ HTML pages can be several MB
4. **Synchronous processing**: Entire diff computed in single blocking operation

## Fix Requirements

### Option 1: Quick Fix - Increase Heap Size
**Changes needed:**
1. Modify `backend/package.json` scripts:
   ```json
   "start": "node --max-old-space-size=4096 src/index.js",
   "dev": "nodemon --max-old-space-size=4096 src/index.js"
   ```

**Pros:**
- Minimal code changes
- Quick to implement
- Preserves existing functionality

**Cons:**
- Doesn't solve underlying issue
- May still fail with larger policies
- Increases memory footprint

### Option 2: Optimize Diff Algorithm
**Changes needed:**
1. Replace `diff.diffWords()` with `diff.diffLines()` in `versioner.js:300`
2. Adjust diff summary formatting logic (lines 301-305)

**Implementation:**
```javascript
// Replace line 300:
const changes = diff.diffLines(latestPolicyVersionData.normalized_text_snapshot, snapshotData.concatText);
```

**Pros:**
- Significantly reduces memory usage
- Maintains similar diff quality
- Simple code change

**Cons:**
- Less granular diff output
- May miss word-level changes

### Option 3: Streaming/Chunked Processing
**Changes needed:**
1. Create new file: `backend/src/services/archiver/streamDiff.js`
2. Implement chunked diff processing:
   - Split texts into manageable chunks (e.g., 100KB)
   - Process diffs sequentially
   - Aggregate results

**Implementation outline:**
```javascript
// streamDiff.js
export async function generateChunkedDiff(oldText, newText, chunkSize = 102400) {
  const oldChunks = splitIntoChunks(oldText, chunkSize);
  const newChunks = splitIntoChunks(newText, chunkSize);
  const diffParts = [];
  
  for (let i = 0; i < Math.max(oldChunks.length, newChunks.length); i++) {
    const oldChunk = oldChunks[i] || '';
    const newChunk = newChunks[i] || '';
    const chunkDiff = diff.diffWords(oldChunk, newChunk);
    diffParts.push(formatDiff(chunkDiff));
    
    // Allow garbage collection between chunks
    await new Promise(resolve => setImmediate(resolve));
  }
  
  return diffParts.join(' ');
}
```

**Pros:**
- Handles arbitrarily large files
- Allows garbage collection
- Future-proof solution

**Cons:**
- More complex implementation
- May produce less accurate diffs at chunk boundaries
- Requires testing for edge cases

### Option 4: Defer Diff Generation
**Changes needed:**
1. Modify `versioner.js` to skip immediate diff generation
2. Create new background job: `backend/src/jobs/diffGeneratorJob.js`
3. Add queue table to database for pending diffs
4. Process diffs asynchronously in separate process

**Database changes:**
```sql
CREATE TABLE pending_diffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_version_id_old UUID REFERENCES policy_versions(id),
  policy_version_id_new UUID REFERENCES policy_versions(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);
```

**Pros:**
- Completely decouples diff from main process
- Can use dedicated worker with more memory
- Non-blocking for policy archiving

**Cons:**
- Most complex implementation
- Diffs not immediately available
- Requires job monitoring/retry logic

### Option 5: Hybrid Approach (Recommended)
**Changes needed:**
1. Add size check before diff generation
2. Use `diffLines` for large texts, `diffWords` for small
3. Add heap size flag as fallback
4. Implement graceful degradation

**Implementation:**
```javascript
// In versioner.js, replace lines 299-305:
try {
  const textSize = latestPolicyVersionData.normalized_text_snapshot.length + snapshotData.concatText.length;
  const SIZE_THRESHOLD = 1024 * 1024; // 1MB combined
  
  let changes;
  if (textSize > SIZE_THRESHOLD) {
    console.log(`[VersionerDeep] Using line-based diff for large texts (${textSize} bytes)`);
    changes = diff.diffLines(latestPolicyVersionData.normalized_text_snapshot, snapshotData.concatText);
  } else {
    changes = diff.diffWords(latestPolicyVersionData.normalized_text_snapshot, snapshotData.concatText);
  }
  
  // If diff is too large, truncate
  const MAX_DIFF_LENGTH = 500000; // 500KB
  diffSummary = changes.map(part => {
    if (part.added) return `[+${part.value.substring(0, 1000)}${part.value.length > 1000 ? '...' : ''}]`;
    if (part.removed) return `[-${part.value.substring(0, 1000)}${part.value.length > 1000 ? '...' : ''}]`;
    return '';
  }).join(' ').replace(/\s+/g, ' ').trim();
  
  if (diffSummary.length > MAX_DIFF_LENGTH) {
    diffSummary = diffSummary.substring(0, MAX_DIFF_LENGTH) + '... [truncated]';
  }
} catch (e) {
  console.error(`[VersionerDeep] Error generating diff, storing without diff:`, e);
  diffSummary = '[Diff generation failed due to size]';
}
```

**Also add to package.json:**
```json
"scripts": {
  "start": "node --max-old-space-size=3072 src/index.js",
  "dev": "nodemon --max-old-space-size=3072 src/index.js"
}
```

**Pros:**
- Balances performance and functionality
- Graceful degradation
- Quick to implement
- Maintains backward compatibility

**Cons:**
- Still has theoretical size limits
- Different diff quality for different documents

## Implementation Steps

1. **Immediate mitigation**: Add heap size flag to package.json
2. **Code change**: Implement hybrid approach in versioner.js
3. **Testing**: Test with known large policies (zoom.com, etc.)
4. **Monitoring**: Add memory usage logging
5. **Future enhancement**: Consider background job for very large diffs

## Testing Strategy

1. Test with current failing case (zoom.com with 110 assets)
2. Create test cases with varying sizes:
   - Small: < 100KB
   - Medium: 100KB - 1MB  
   - Large: 1MB - 5MB
   - Extra large: > 5MB
3. Verify diff quality at each size threshold
4. Monitor memory usage during processing
5. Ensure no data loss or corruption

## Rollback Plan

If issues arise:
1. Keep original code commented
2. Feature flag for new diff logic
3. Can disable diff generation entirely as last resort (non-breaking)

## Long-term Considerations

1. Consider moving to dedicated diff service
2. Implement incremental diffing (only diff changed assets)
3. Store diffs in compressed format
4. Use external diff tools optimized for large files
5. Implement diff caching for frequently accessed versions