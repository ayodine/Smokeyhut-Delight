async function test() {
  const GEMINI_API_KEY = "AIzaSyCnFykRBAnXMkv0vgCnWHdayVJdoIQ6QE4";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
  console.log(await response.json());
}
test();
