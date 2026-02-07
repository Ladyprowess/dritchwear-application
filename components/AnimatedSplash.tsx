import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import LottieView from "lottie-react-native";

export default function AnimatedSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400); // match your lottie length
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.container}>
      <LottieView
        source={require("../assets/animations/splash.json")}
        autoPlay
        loop={false}
        onAnimationFinish={onDone}
        style={{ width: 260, height: 260 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
});