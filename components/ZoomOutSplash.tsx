import { Animated, View, Image, StyleSheet } from "react-native";
import { useEffect, useRef } from "react";

export default function ZoomOutSplash({ onDone }: { onDone: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.85, // zoom OUT
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(onDone);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require("../assets/images/splash.png")}
        style={[
          styles.logo,
          { transform: [{ scale }], opacity },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff", // MUST match splash bg
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logo: {
    width: 240,
    height: 240,
  },
});