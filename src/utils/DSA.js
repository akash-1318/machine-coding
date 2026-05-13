function rotate(nums, k) {
    const n = nums.length;
    k = k % n; // handle k > n

    // helper function to reverse array portion
    function reverse(start, end) {
        while (start < end) {
            [nums[start], nums[end]] = [nums[end], nums[start]];
            start++;
            end--;
        }
    }

    // Step 1: reverse entire array
    reverse(0, n - 1);

    // Step 2: reverse first k elements
    reverse(0, k - 1);

    // Step 3: reverse remaining elements
    reverse(k, n - 1);
}