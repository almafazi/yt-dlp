package utils

import "regexp"

func IsInstagramURL(url string) bool {
	// Define a regular expression pattern for Instagram URLs.
	// This pattern checks for URLs starting with http(s)://(www.)instagram.com/ followed by any characters.
	pattern := `^(https?:\/\/)?(www\.)?instagram\.com\/.+$`

	// Compile the regular expression.
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}

	return re.MatchString(url)
}

func IsTikTokLink(url string) bool {
	pattern := `^.*https:\/\/(?:m|www|vm)?\.?tiktok\.com\/((?:.*\b(?:(?:usr|v|embed|user|photo|photos|video)\/|\?shareId=|\&item_id=)(\d+))|\w+)`
	matched, _ := regexp.MatchString(pattern, url)
	return matched
}
