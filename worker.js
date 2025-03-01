
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type"
    };

    const ALLOWED_USERS = ["Hiplitehehe"]; // Modify with allowed GitHub usernames

    // 🔹 Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 🔹 GitHub Login Redirect
    if (url.pathname === "/login") {
      return Response.redirect(
        `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${env.REDIRECT_URI}&scope=repo`,
        302
      );
    }

    // 🔹 GitHub OAuth Callback
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Missing code", { status: 400 });

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: env.REDIRECT_URI
        })
      });

      const tokenText = await tokenResponse.text();
      return new Response(tokenText, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    // 🔹 Approve Note (Only Allowed Users)
    if (url.pathname === "/approve") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      const token = authHeader.split(" ")[1];

      // Verify GitHub user
      const userResponse = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = await userResponse.json();
      if (!userData.login) return new Response("Invalid token", { status: 401, headers: corsHeaders });

      if (!ALLOWED_USERS.includes(userData.login)) {
        return new Response("Permission denied: You cannot approve notes.", { status: 403, headers: corsHeaders });
      }

      // Get note title from request
      const body = await request.json();
      if (!body.title) return new Response("Missing note title", { status: 400, headers: corsHeaders });

      // Fetch current notes
      const repo = "hiplitehehe/Notes"; // Replace with your repo
      const notesFile = "j.json";
      const notesUrl = `https://api.github.com/repos/${repo}/contents/${notesFile}`;
      
      let notes = [];
      const fetchNotes = await fetch(notesUrl, {
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json" },
      });

      let fileData;
      if (fetchNotes.ok) {
        fileData = await fetchNotes.json();
        notes = JSON.parse(atob(fileData.content));
      }

      // Add approved note
      notes.push({ title: body.title, approved: true });

      // Update GitHub
      const updateResponse = await fetch(notesUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Approved note: ${body.title}`,
          content: btoa(JSON.stringify(notes, null, 2)),
          sha: fileData?.sha || undefined, // Required to update file if exists
        }),
      });

      if (!updateResponse.ok) {
        return new Response("Failed to approve note", { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ message: `Note "${body.title}" approved!` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 🔹 Get Only Approved Notes
    if (url.pathname === "/notes") {
      const repo = "hiplitehehe/bookish-octo-robot"; // Replace with your repo
      const notesFile = "j.json";
      const notesUrl = `https://api.github.com/repos/${repo}/contents/${notesFile}`;

      const fetchNotes = await fetch(notesUrl, {
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json" },
      });

      if (!fetchNotes.ok) return new Response("Failed to fetch notes", { status: 500, headers: corsHeaders });

      const fileData = await fetchNotes.json();
      const notes = JSON.parse(atob(fileData.content));

      // Filter only approved notes
      const approvedNotes = notes.filter(note => note.approved);

      return new Response(JSON.stringify(approvedNotes), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
