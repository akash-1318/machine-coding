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

// function to calculate the factorial of a number
function factorial(n) {
    if (n === 0 || n === 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

// function to validate user email address using regex expression
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}


// function to fetch data from an api and log the response
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}