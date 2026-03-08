import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    return NextResponse.json({ error: "Unsplash API key not configured" }, { status: 500 });
  }

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query
      )}&per_page=1&orientation=squarish`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: "Unsplash API error", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    const imageUrl = data.results[0]?.urls?.small || null;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Unsplash search error:", error);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
