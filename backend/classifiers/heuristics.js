/**
 * Heuristics Classifier
 * Phase 3: Zero LLM cost deterministic bug detection
 * 
 * Compares two snapshots (e.g., WA submission and subsequent AC submission)
 * and uses regex/diff heuristics to flag what likely went wrong.
 */

function classifyBug(oldCode, newCode) {
    const flags = [];

    // 1. Off-by-one / Out-of-bounds
    // Looks for changes like `<` to `<=`, or `n` to `n+1` in loops/array accesses
    if (newCode.includes('<=') && !oldCode.includes('<=')) {
        if (oldCode.includes('<')) flags.push('off_by_one_boundary');
    }
    if (newCode.includes('>=') && !oldCode.includes('>=')) {
        if (oldCode.includes('>')) flags.push('off_by_one_boundary');
    }
    if ((newCode.includes('+ 1') || newCode.includes('+1')) && !oldCode.includes('+ 1') && !oldCode.includes('+1')) {
        flags.push('off_by_one_addition');
    }

    // 2. Integer Overflow
    // Changed int to long long (C++) or added BigInt (JS/Java)
    const oldLongs = (oldCode.match(/long long/g) || []).length;
    const newLongs = (newCode.match(/long long/g) || []).length;
    if (newLongs > oldLongs) {
        flags.push('integer_overflow_correction');
    }

    // 3. Constant Factor / Wrong Complexity
    // Swapped from vector to set, or map to unordered_map, or removed a nested loop
    if (newCode.includes('unordered_map') && !oldCode.includes('unordered_map') && oldCode.includes('map')) {
        flags.push('constant_factor_optimization_map');
    }
    if (newCode.includes('unordered_set') && !oldCode.includes('unordered_set') && oldCode.includes('set')) {
        flags.push('constant_factor_optimization_set');
    }
    
    // Check for removed nested loops (basic heuristic)
    const oldForCount = (oldCode.match(/for\s*\(/g) || []).length;
    const newForCount = (newCode.match(/for\s*\(/g) || []).length;
    if (oldForCount > newForCount + 1) {
        flags.push('complexity_reduction_loop_removed');
    }

    return flags;
}

module.exports = { classifyBug };
