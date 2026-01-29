# Dritchwear Application

## Description

The **Dritchwear Application** is a mobile e-commerce platform built for **Dritchwear**, a Nigerian-based brand specialising in custom streetwear, branded merchandise, and apparel.

Users can browse, customise, and purchase high-quality streetwear items, with features for personalisation, order tracking, tax calculations, and secure payments via **PayPal** and **Paystack**.

The app is developed using **React Native with Expo** for cross-platform compatibility (Android and iOS), **TypeScript** for type safety, and **Supabase** for backend services, including database management and authentication.

This application enables individuals, businesses, and events to create and order custom designs that are produced and shipped worldwide from Nigeria. The focus is on a seamless and reliable user experience for people looking for made-to-order streetwear.

---

## Table of Contents

- Features  
- Technologies  
- Installation  
- Usage  
- Configuration  
- Contributing  
- License  
- Contact  

---

## Features

- **Product Browsing and Customisation**  
  Explore streetwear collections and customise designs, colours, and sizes.

- **User Authentication**  
  Secure sign-up and login powered by Supabase.

- **Order Management**  
  Cart functionality, order history, and real-time order tracking.

- **Payment Integration**  
  Secure payments using PayPal and Paystack.

- **Tax Calculations**  
  Automated tax handling based on location and regulations.

- **Cross-Platform Support**  
  Runs on both Android and iOS devices.

- **Responsive UI**  
  Built with reusable components for a consistent experience.

- **Backend Integration**  
  Supabase handles data storage, queries, authentication, and real-time updates.

---

## Technologies

- **Frontend**: React Native, Expo, TypeScript  
- **Backend**: Supabase (database, authentication, storage)  
- **State Management**: Context API with custom hooks  
- **Payments**: PayPal SDK, Paystack  
- **Other Libraries**: Utilities for image handling, forms, and UI components (see `package.json`)  
- **Languages**:  
  - TypeScript (96.7%)  
  - JavaScript  
  - Kotlin (Android)  
  - Swift (iOS)  
  - PL/pgSQL (Supabase)

---

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)  
- Yarn or npm  
- Expo CLI (installed globally)  
- Android Studio or Xcode (optional for native builds)  
- Supabase account  
- PayPal developer account  
- Paystack developer account  

Install Expo CLI globally:

    npm install -g expo-cli

---

### Steps

1. Clone the repository:

        git clone https://github.com/Ladyprowess/dritchwear-application.git

2. Navigate to the project directory:

        cd dritchwear-application

3. Install dependencies:

        npm install
        # or
        yarn install

4. Set up environment variables:

   Create a `.env` file in the root directory and add the following values.

   Supabase configuration:

        EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
        EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   PayPal credentials (testing):

        PAYPAL_CLIENT_ID=your-paypal-client-id
        PAYPAL_SECRET=your-paypal-secret

   Paystack credentials (testing):

        PAYSTACK_PUBLIC_KEY=your-paystack-public-key
        PAYSTACK_SECRET_KEY=your-paystack-secret-key

5. Configure native builds if required:

   - Android: ensure the `android/` directory is properly set up  
   - iOS: ensure the `ios/` directory is properly set up  

---

## Usage

### Running the App

Start the development server:

    npx expo start

Run on a device or emulator:

- Scan the QR code using the Expo Go app  
- Press `a` for Android emulator  
- Press `i` for iOS simulator  

Build for production:

    npx expo build:android
    # or
    npx expo build:ios

---

### Testing Payments

PayPal testing:

    node test-paypal.js

Paystack testing is handled inside the checkout components. You can also create custom test scripts if required.

---

### Example Workflow

1. Launch the app and sign up or log in  
2. Browse products in the catalogue  
3. Customise an item (for example, upload a design image)  
4. Add the item to the cart  
5. Review taxes and totals  
6. Complete checkout using PayPal or Paystack  

---

## Configuration

- **Supabase Setup**  
  Initialise your Supabase project and update types in `/types/` and functions in `/supabase/`.

- **Tax Functionality**  
  Location-based tax logic is configured in `/supabase/`.

- **Google Services**  
  If Firebase is used, add `google-services.json`. This file is excluded for security and should be regenerated via the Firebase Console.

- **App Configuration**  
  Update `app.json` and `app.config.js` for app metadata, icons, splash screens, and platform settings.

- **Payment Gateways**  
  Configure PayPal and Paystack using environment variables and integrate them in the checkout components.

For additional documentation, see the `/docs/` directory.

---

## Contributing

Contributions are welcome.

1. Fork the repository  
2. Create a new branch:

        git checkout -b feature/your-feature

3. Commit your changes:

        git commit -m "Add your feature"

4. Push to your branch:

        git push origin feature/your-feature

5. Open a Pull Request  

Please follow the code style defined in `.prettierrc`.  
For major changes, open an issue before submitting a pull request.

---

## License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for full details.

---

## Contact

- **Author**: Ngozi (Ladyprowess)   
- **X (Twitter)**: @dritchwear
- **Business**: Dritchwear – Wear it. Brand it. Gift it.
- **Website**: https://dritchwear.com  
- **Instagram**: @dritchwear  

For feedback or collaboration, feel free to reach out.
