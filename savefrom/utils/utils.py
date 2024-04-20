import re

def is_instagram_url(url: str) -> bool:
    # Define a regular expression pattern for Instagram URLs.
    # This pattern checks for URLs starting with http(s)://(www.)instagram.com/ followed by any characters.
    pattern = r'^(https?:\/\/)?(www\.)?instagram\.com\/.+$'

    # Use the re module to compile the regular expression and match the URL.
    return bool(re.match(pattern, url))

def is_tiktok_link(url: str) -> bool:
    pattern = r'^.*https:\/\/(?:m|www|vm)?\.?tiktok\.com\/((?:.*\b(?:(?:usr|v|embed|user|photo|photos|video)\/|\?shareId=|\&item_id=)(\d+))|\w+)'
    return bool(re.match(pattern, url))


def is_youtube_link(url: str) -> (bool):
    # Regular expression pattern to match YouTube URL and capture the video ID
    pattern = r'(youtu.*be.*)\/(watch\?v=|embed\/|v|shorts|)(.*?((?=[&#?])|$))'
    
    # Use the re module to search the URL with the pattern
    match = re.search(pattern, url)
    
    # Check if the URL matches the regular expression
    if match:
        # Return a tuple indicating it's a YouTube URL and include the video ID
        return True
    else:
        # Return a tuple indicating it's not a YouTube URL and no video ID
        return False
