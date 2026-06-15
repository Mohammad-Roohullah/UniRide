function flipCard() {
  const card = document.getElementById("authCard");
  card.classList.toggle("flipped");
}

// Validate university email format on signup
document.getElementById("signup-email").addEventListener("blur", function () {
  const email = this.value;
  if (!email.match(/^k\d{6}@nu\.edu\.pk$/i)) {
    this.style.borderColor = "red";
    alert("Please use your university email in format: kXXXXXX@nu.edu.pk");
  } else {
    this.style.borderColor = "#e9ecef";
  }
});
